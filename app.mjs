import express from "express";
import serveIndex from "serve-index";
import { configparser } from "./helpers/configparser.mjs";
import path from "path";
import { config } from "dotenv";
import cors from "cors";

config();
const app = express();

const __dirname = path.dirname(new URL(import.meta.url).pathname);

//const configparser = require("./helpers/configparser.mjs");

//Download Dir, URL für Config, isDebug?
async function main() {
  let timeout = configparser.check_env_var("SYNCTIMEOUT", 5000); //Timeout for sleep between sync checks
  let serverport = configparser.check_env_var("SERVERPORT", 3000); // port for express server
  let TOKEN = configparser.check_env_var("TOKEN", "notforyou", true);
  let SLUG = configparser.check_env_var("SLUG", "");
  let BASEURL = configparser.check_env_var("BASEURL", "https://preview-phi.vercel.app/api/download"); //Base URL for config files
  let baseUrl = BASEURL + "?slug=" + SLUG + "&token=" + TOKEN;
  let RESET_FILES = configparser.check_env_var("RESET_FILES", "false");

  await configparser.init(__dirname, baseUrl, false);
  if (RESET_FILES != "false") {
    await configparser.clear(); //delete all downloads if set
  }
  await download(timeout);
  //TODO check if we want a success download before start server

  app.use(cors());
  app.use("/", express.static(configparser.get_content_dir()), serveIndex(configparser.get_content_dir(), { icons: true }));

  app.use((err, req, res, next) => {
    if (err && err.status === 416) {
      // Checking for Range Not Satisfiable error
      res.status(416).send("Range Not Satisfiable");
    } else {
      next(err); // Pass the error to the next error-handling middleware (if any) or let Express default error handler handle it
    }
  });
  app.listen(serverport, () => console.log("[SERVER] start file server on http://" + "localhost" + ":" + serverport));
}

main();

function download(timeout) {
  return new Promise((resolve, reject) => {
    async function downloadLoop() {
      try {
        let parsedFile = await configparser.parseFetch();
        let fetchSuccess = await configparser.downloadFetch(parsedFile.fetchData, parsedFile.configFile, true);
        if (fetchSuccess != "sync") {
          let filesArray = [];
          await Promise.all(
            parsedFile.fetchData.map(async (data) => {
              filesArray.push(data.path);
            })
          );
          await configparser.clear(filesArray); //delete all downloads
          await configparser.sync();
          await configparser.cleanFetch(parsedFile.fetchData, parsedFile.configFile);
          let urlsArray = [];
          await Promise.all(
            filesArray.map(async (data) => {
              let element = await configparser.parseUrls(data);
              urlsArray = urlsArray.concat(element);
            })
          );
          let configFiles = await configparser.urlReplace(filesArray, urlsArray);
          filesArray = filesArray.concat(configFiles);
          //download and sync urls from all config files
          let downloadSuccess = await configparser.downloadUrls(urlsArray);
          if (downloadSuccess) {
            await configparser.sync();

            for (let index = 0; index < urlsArray.length; index++) {
              const reqUrl = new URL(urlsArray[index]);
              let dlDest = reqUrl.pathname;
              dlDest = dlDest.indexOf("/") == 0 ? dlDest.substring(1) : dlDest;
              filesArray.push(dlDest);
            }
            if (downloadSuccess != "sync") await configparser.clean(filesArray, parsedFile.configFile, true);
          }
        }
        resolve(true);
        setTimeout(downloadLoop, timeout);
      } catch (error) {
        console.error(error);
        console.error("[MAIN] ERR try to restart ....");
        resolve(false);
        setTimeout(downloadLoop, timeout);
      }
    }
    downloadLoop();
  });
}
