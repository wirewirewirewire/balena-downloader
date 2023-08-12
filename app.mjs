import express from "express";
import serveIndex from "serve-index";
import { configparser } from "./helpers/configparser.mjs";
import path from "path";
import { config } from "dotenv";
config();
const app = express();

const __dirname = path.dirname(new URL(import.meta.url).pathname);

//const configparser = require("./helpers/configparser.mjs");

const BASEURL = "https://preview-phi.vercel.app/api/download";
const SLUG = "beispiel";

//Download Dir, URL für Config, isDebug?
async function main() {
  let timeout = configparser.check_env_var("SYNCTIMEOUT", 5000); //Timeout for sleep between sync checks
  let serverport = configparser.check_env_var("SERVERPORT", 3000); // port for express server
  let TOKEN = configparser.check_env_var("TOKEN", "notforyou", true);
  var baseUrl = BASEURL + "?slug=" + SLUG + "&token=" + TOKEN;
  await configparser.init(__dirname, baseUrl, true);
  await download(timeout);
  //TODO check if we want a success download before start server
  app.use("/", express.static(configparser.get_content_dir()), serveIndex(configparser.get_content_dir(), { icons: true }));
  app.listen(serverport, () => console.log("[SERVER] start file server on port: " + serverport));
}

main();

function download(timeout) {
  return new Promise((resolve, reject) => {
    async function downloadLoop() {
      try {
        let parsedFile = await configparser.parseFetch();
        let fetchSuccess = await configparser.downloadFetch(parsedFile.fetchData, parsedFile.configFile, true);
        if (fetchSuccess != "sync") {
          await configparser.sync();
          await configparser.clean(parsedFile.fetchData, parsedFile.configFile);

          let urlsArray = [];
          let filesArray = [];
          console.log("[MAIN] start download");
          await Promise.all(
            parsedFile.fetchData.map(async (data) => {
              filesArray.push(data.path);
              let element = await configparser.parseUrls(data.path);
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
            if (downloadSuccess != "sync") configparser.clean(filesArray, parsedFile.configFile, true);
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
