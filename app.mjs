import express from "express";
import serveIndex from "serve-index";
import { configparser } from "./helpers/configparser.mjs";
import path from "path";

const app = express();
const __dirname = path.dirname(new URL(import.meta.url).pathname);

//const configparser = require("./helpers/configparser.mjs");

const baseurl = "https://exhibition-strapi.herokuapp.com/devices/12";

var serverport = 3000;
//Download Dir, URL für Config, isDebug?
async function main() {
  var timeout = configparser.check_env_var("SYNCTIMEOUT", 5000); //Timeout for sleep between sync checks

  configparser.init(__dirname, baseurl, false).then(function () {
    download(timeout).then((ok) => {
      serverport = configparser.check_env_var("SERVERPORT", serverport); //Server port for Node server
      app.use("/", express.static(configparser.get_content_dir()), serveIndex(configparser.get_content_dir(), { icons: true }));
      //app.use(express.static(configparser.get_content_dir()));
      app.listen(serverport, () => console.log("[SERVER] static server on port: " + serverport));
    });
  });
}

main();

function download(timeout) {
  return new Promise((resolve, reject) => {
    function downloadLoop() {
      configparser
        .parseUrls()
        .then((urls) => {
          configparser.download(urls).then((isDownload) => {
            if (isDownload) {
              configparser.sync();
              if (isDownload != "sync") configparser.clean();
              resolve(true);
              setTimeout(downloadLoop, timeout);
            }
          });
        })
        .catch((err) => {
          console.error(err);
          console.error("[MAIN] ERR try to restart ....");
          resolve(true);
          setTimeout(downloadLoop, timeout);
        });
    }
    downloadLoop();

    //setTimeout(arguments.callee, 3000);
  });
}
