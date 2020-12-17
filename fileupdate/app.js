const express = require("express");
const app = express();
var serveIndex = require("serve-index");
const configparser = require("./helpers/configparser.js");

const baseurl = "https://exhibition-strapi.herokuapp.com/devices/6";

var serverport = 3000;
var timeout = configparser.check_env_var("SYNCTIMEOUT", 5000); //Timeout for sleep between sync checks
//Download Dir, URL für Config, isDebug?
configparser.init(__dirname, baseurl, false).then(function () {
  download().then((ok) => {
    serverport = configparser.check_env_var("SERVERPORT", serverport); //Server port for Node server
    app.use("/", express.static(configparser.get_content_dir()), serveIndex(configparser.get_content_dir(), { icons: true }));
    //app.use(express.static(configparser.get_content_dir()));
    app.listen(serverport, () => console.log("Static Server on Port: " + serverport));
  });
});

function download() {
  return new Promise((resolve, reject) => {
    configparser
      .parseUrls()
      .then((urls) => {
        configparser.download(urls).then((isDownload) => {
          if (isDownload) {
            configparser.sync();
            if (isDownload != "sync") configparser.clean();
            resolve(true);
            setTimeout(arguments.callee, timeout);
          }
        });
      })
      .catch((err) => {
        console.error(err);
        resolve(true);
        setTimeout(arguments.callee, timeout);
      });

    //setTimeout(arguments.callee, 3000);
  });
}
