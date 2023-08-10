import express from "express";
import serveIndex from "serve-index";
import { configparser } from "./helpers/configparser.mjs";
import path from "path";
import { config } from "dotenv";
config();

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
  //const app = express();
  //app.use("/", express.static(configparser.get_content_dir()), serveIndex(configparser.get_content_dir(), { icons: true }));
  //app.listen(serverport, () => console.log("[SERVER] start file server on port: " + serverport));
}

main();

function download(timeout) {
  return new Promise((resolve, reject) => {
    async function downloadLoop() {
      try {
        let parsedFile = await configparser.parseUrls();
        let downloadSuccess = await configparser.download(parsedFile.fetchData, parsedFile.configFile);
        if (downloadSuccess) {
          configparser.sync(); //TODO make this async?
          if (downloadSuccess != "sync") configparser.clean(parsedFile.fetchData, parsedFile.configFile);
          resolve(true);
        }
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
