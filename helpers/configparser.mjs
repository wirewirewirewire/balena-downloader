/*const util = require("util");
const http = require("http");
const getUrls = require("get-urls");
var url = require("url");
var fs = require("fs");
var path = require("path");
const async = require("async");
const cliProgress = require("cli-progress");*/

//const getUrls = await import("get-urls");
import http from "http";
import getUrls from "get-urls";
import url from "url";
import fs from "fs";
import path from "path";
import async from "async";
import cliProgress from "cli-progress";

var URL_IGNORES = [];
const bars = [];
var bars_multi;

var UPDATE_FOLDER = "";
var LIVE_FOLDER = "";
var AUTH_USER = "";
var AUTH_PW = "";
var ParsedFiles;
var ConfigJSON;
var BASEPATH; //Base of the running app (absolut)
var BASE_URL;
var ISDEBUG = false;

function deleteFiles(files, callback) {
  var i = files.length;
  files.forEach(function (filepath) {
    console.log("Del File from Live:" + filepath);
    fs.unlink(filepath, function (err) {
      i--;
      if (err) {
        callback(err);
        return;
      } else if (i <= 0) {
        callback(null);
      }
    });
  });
}

function copyFileSync(source, target) {
  var targetFile = target;

  //if target is a directory a new file with the same name will be created
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isDirectory()) {
      targetFile = path.join(target, path.basename(source));
    }
  }

  fs.writeFileSync(targetFile, fs.readFileSync(source));
}
function copyFolderRecursiveSync(source, target) {
  var files = [];

  //check if folder needs to be created or integrated
  var targetFolder = path.join(target, path.basename(source));
  if (!targetFolder.includes(source)) {
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder);
    }
  } else {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target);
    }
    targetFolder = target + "/";
  }
  //copy
  if (fs.lstatSync(source).isDirectory()) {
    files = fs.readdirSync(source);
    files.forEach(function (file) {
      var curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, targetFolder);
      } else {
        console.log("Sync: " + curSource + "  To: " + targetFolder + "/" + file);
        copyFileSync(curSource, targetFolder);
      }
    });
  }
}
const deleteFolderRecursive = function (filepath) {
  if (fs.existsSync(filepath)) {
    fs.readdirSync(filepath).forEach((file, index) => {
      const curPath = path.join(filepath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // recurse
        deleteFolderRecursive(curPath);
      } else {
        // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(filepath);
  } else {
    if (ISDEBUG) console.log("No Files to Clean");
  }
};
var listFilesRecursive = function (dir, done) {
  var results = [];
  fs.readdir(dir, function (err, list) {
    if (err) return done(err);
    var i = 0;
    (function next() {
      var file = list[i++];
      if (!file) return done(null, results);
      file = path.resolve(dir, file);
      fs.stat(file, function (err, stat) {
        if (stat && stat.isDirectory()) {
          listFilesRecursive(file, function (err, res) {
            results = results.concat(res);
            next();
          });
        } else {
          results.push(file);
          next();
        }
      });
    })();
  });
};
const downloadFile = async function (url_dl, cli_index = 0, cb = null) {
  return new Promise((resolve, reject) => {
    var dest = url.parse(url_dl).pathname;
    var dest_string = dest.indexOf("/") == 0 ? dest.substring(1) : dest;
    if (!fs.existsSync(LIVE_FOLDER + "/" + dest_string) && !fs.existsSync(UPDATE_FOLDER + "/" + dest_string)) {
      //console.log("Download URL: " + url_dl);
      var folders = dest_string.split("/");
      var j;
      var struct = UPDATE_FOLDER + "/";
      if (!fs.existsSync(struct)) {
        fs.mkdirSync(struct);
      }
      for (j = 0; j < folders.length - 1; j++) {
        struct = struct + folders[j];
        if (fs.existsSync(struct) && !fs.existsSync(struct + "/")) {
          console.log("Del File blocking Folder " + struct);
          fs.unlinkSync(struct);
        }
        struct = struct + "/";
        if (!fs.existsSync(struct)) {
          fs.mkdirSync(struct);
        }
      }
      struct = "";
      var file = fs.createWriteStream(UPDATE_FOLDER + "/" + dest_string);
      var request = http
        .get(
          {
            path: url.parse(url_dl).pathname,
            hostname: url.parse(url_dl).hostname,
            //auth: AUTH_USER + ":" + AUTH_PW,
          },
          function (response) {
            if (response.statusCode < 200 || response.statusCode > 299) {
              //console.log("Error Code:" + response.statusCode + " URL: " + url_dl);
              fs.unlink(UPDATE_FOLDER + "/" + dest_string, function () {
                console.log("Error Code:" + response.statusCode + " Del File: " + UPDATE_FOLDER + "/" + dest_string);
              });
            }
            response.pipe(file);

            var download_size = Math.round(response.headers["content-length"] / 1048576);
            bars[cli_index] = bars_multi.create(download_size, 0, { filename: dest_string });
            //console.log(" " + url_dl + ` (${download_size} MB)`);
            var download_log = setInterval(function () {
              var stats = fs.statSync(UPDATE_FOLDER + "/" + dest_string);
              var size = Math.round(stats.size / 1048576);
              bars[cli_index].update(size, { filename: dest_string });
              //printSameline("Status: " + Math.round((size / download_size) * 100) + "% (" + size + " MB)");
              //console.log("Status: " + Math.round((size / download_size) * 100) + "% (" + size + " MB)");
            }, 2000);
            file.on("finish", function () {
              clearInterval(download_log);
              bars[cli_index].update(download_size, { filename: dest_string });
              bars[cli_index].stop();
              //console.log("Download Finished URL: " + url_dl);
              file.close(resolve(true));
              //file.close(cb); // close() is async, call cb after close completes.
            });
          }
        )
        .on("error", function (err) {
          // Handle errors
          console.log("Err: " + err);
          fs.unlink(UPDATE_FOLDER + "/" + dest_string, function () {
            console.log("error");
            //if (cb) cb(err.message);
            resolve(err.message);
          }); // Delete the file async. (But we don't check the result)
        });
    } else {
      if (ISDEBUG) console.log("File Exists");
      resolve(false);
      //cb(null);
    }
  });
};

function checkBool(string) {
  if (typeof string == "boolean") return string;
  switch (string.toLowerCase().trim()) {
    case "true":
    case "yes":
    case "1":
      return true;
    case "false":
    case "no":
    case "0":
    case null:
      return false;
    default:
      return Boolean(string);
  }
}

function checkENV(ENV, alt_var, secret = false) {
  //console.log(eval("process.env." +  ENV))
  if (eval("process.env." + ENV)) {
    if (secret) {
      console.log("Set " + ENV + " from ENV to: ***");
    } else {
      console.log("Set " + ENV + " from ENV to: " + eval("process.env." + ENV));
    }
    return eval("process.env." + ENV);
  } else {
    if (secret) {
      console.log("Set " + ENV + " from Default to: ***");
    } else {
      console.log("Set " + ENV + " from Default to: " + alt_var);
    }
    return alt_var;
  }
}

export const configparser = {
  //Get all Download links from json
  init: function (
    basepath,
    baseurl,
    isdebug = false,
    l_folder = "update_live",
    u_folder = "update_tmp",
    auth_user = "ausstellung",
    auth_pw = "osb23nmp"
  ) {
    return new Promise((resolve, reject) => {
      console.log("---INIT FILESYNC---");
      BASEPATH = checkENV("BASEPATH", basepath); //Path to the directory for downloads (app dir default)
      AUTH_USER = checkENV("AUTH_USER", auth_user); //auth user for download
      AUTH_PW = checkENV("AUTH_PW", auth_pw, true); //auth pw for download
      UPDATE_FOLDER = checkENV("UPDATE_FOLDER", u_folder); //folder to save files in update
      LIVE_FOLDER = checkENV("LIVE_FOLDER", l_folder); //folder to save files when download done
      BASE_URL = checkENV("BASE_URL", baseurl); //url to config json with files
      ISDEBUG = checkBool(checkENV("ISDEBUG", isdebug)); //enable debug for console output
      deleteFolderRecursive(UPDATE_FOLDER);

      bars_multi = new cliProgress.MultiBar(
        {
          clearOnComplete: false,
          hideCursor: true,
          format: "                                        {bar} {percentage}%  | ETA: {eta}s | {value}/{total} MB | {filename}",
        },
        cliProgress.Presets.shades_grey
      );

      console.log("---INIT DONE--- ");
      resolve(true);
    });
  },
  //ToDo: Clean JSON from not downloadable URLs
  parseUrls: function (address = BASE_URL) {
    return new Promise((resolve, reject) => {
      var request = http.request(
        {
          path: url.parse(address).pathname,
          hostname: url.parse(address).hostname,
          //auth: AUTH_USER + ":" + AUTH_PW,
        },
        function (response) {
          if (response.statusCode < 200 || response.statusCode > 299) {
            reject(new Error("Failed to load page, status code: " + response.statusCode));
          }
          response.setEncoding("utf8");
          let urls_data;
          var data = "";
          response.on("data", function (chunk) {
            data += chunk;
          });
          response.on("end", () => {
            let json = JSON.parse(data);
            //console.log("Session: %j", json);
            let text = JSON.stringify(json);
            ConfigJSON = text;
            if (ISDEBUG) console.log("Excluded URLs");
            if (ISDEBUG) console.log(URL_IGNORES);
            urls_data = Array.from(getUrls(text, { requireSchemeOrWww: true, exclude: URL_IGNORES }));
            URL_IGNORES.forEach((element) => {
              if (urls_data.indexOf(element) > -1) {
                let index = urls_data.indexOf(element);
                if (ISDEBUG) console.log("Found index in Output " + index);
                urls_data.splice(index, index + 1);
                //In the array!
              }
            });

            if (ISDEBUG) console.log("Left for DL URLs");
            if (ISDEBUG) console.log(urls_data);
            //Filter URLS that are not wanted (no files)
            ParsedFiles = urls_data;
            resolve(urls_data);
          });
        }
      );
      request.on("error", (err) => {
        reject(err);
      });
      request.end();
    });
  },
  //Download URL to Temp Dir
  download: async function (urls) {
    return new Promise((resolve, reject) => {
      if (ISDEBUG) console.log("--DOWNLOAD " + urls.length + " FILES--");
      if (ISDEBUG) console.log(urls);
      //console.log(fs.readFileSync(BASEPATH + '/' + LIVE_FOLDER + "/config.json") == ConfigJSON)
      var configSync = false;
      if (fs.existsSync(BASEPATH + "/" + LIVE_FOLDER + "/config.json")) {
        if (fs.readFileSync(BASEPATH + "/" + LIVE_FOLDER + "/config.json") == ConfigJSON) {
          configSync = true;
          //resolve("sync");
          //return;
        } else {
          console.log("Config Update");
          configSync = false;
        }
        if (ISDEBUG) console.log("configSync: " + configSync);
      }
      if (typeof urls === "undefined" && !urls.length > 0) {
        console.log("No URLs to Download");
        resolve(false);
      }
      newdl_counter = 0;
      async
        .forEachOfLimit(urls, 5, (value, key, callback) => {
          downloadFile(value, key).then(function (status) {
            if (ISDEBUG) console.log("isDownload: " + status);
            if (!status == true) newdl_counter++;
            callback();
          });
        })
        //downloadFile(urls[4], null)
        .then(() => {
          if (ISDEBUG) console.log("Download Done - skipped:" + newdl_counter + " from: " + urls.length);
          if (newdl_counter == urls.length && configSync) {
            resolve("sync");
          } else {
            bars_multi.stop();
            resolve(true);
          }
        })
        .catch((err) => {
          console.error("Download Error: " + err);
          reject(err);
        });
    });
  },
  //Copy Temp Downloads to Live System
  sync: function () {
    if (fs.existsSync(UPDATE_FOLDER)) {
      if (ISDEBUG) console.log("Begin Sync");
      copyFolderRecursiveSync(UPDATE_FOLDER, LIVE_FOLDER);
    } else {
      if (ISDEBUG) console.log("No Temp Folder - No Files to Sync");
    }
  },
  clean: function () {
    if (!fs.existsSync(LIVE_FOLDER)) {
      fs.mkdirSync(LIVE_FOLDER);
    }
    fs.writeFileSync(LIVE_FOLDER + "/config.json", ConfigJSON);
    listFilesRecursive(LIVE_FOLDER, function (err, result) {
      ParsedFiles.forEach((element) => {
        let element_index = result.indexOf(BASEPATH + "/" + LIVE_FOLDER + url.parse(element).pathname);
        if (element_index !== -1) {
          result.splice(element_index, 1);
        } else {
          console.log("Add to Ignor:" + element);
          URL_IGNORES.push(element);
          console.log("File from JSON not found (SYNC ERROR): " + LIVE_FOLDER + url.parse(element).pathname);
        }
        var re = new RegExp(element, "g");
        ConfigJSON = JSON.parse(JSON.stringify(ConfigJSON).replace(re, url.parse(element).pathname));
      });
      result.splice(result.indexOf(BASEPATH + "/" + LIVE_FOLDER + "/config.json"), 1);
      result.splice(result.indexOf(BASEPATH + "/" + LIVE_FOLDER + "/config_files.json"), 1);
      fs.writeFileSync(LIVE_FOLDER + "/config_files.json", ConfigJSON);
      //Filter config.json not to delete
      deleteFiles(result, function (err) {
        if (err) {
          console.log(err);
        } else {
          console.log("All Files not in JSON removed");
        }
      });
    });
    deleteFolderRecursive(UPDATE_FOLDER);
    console.log("---UPDATE ALL DONE---");
  },
  get_content_dir: function () {
    return LIVE_FOLDER;
  },
  check_env_var: function (sysvar, altvar) {
    return checkENV(sysvar, altvar);
  },
};
