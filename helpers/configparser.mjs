import https from "https";
import http, { get } from "http";
import url from "url";
import getUrls from "get-urls";

import fs from "fs";
import path from "path";
import async from "async";
import fetch from "node-fetch";

var URL_IGNORES = [];

var UPDATE_FOLDER = "";
var LIVE_FOLDER = "";
var BASEPATH; //Base of the running app (absolut)
var BASE_URL;
var ISDEBUG = false;

function IsJsonString(str) {
  var result;
  try {
    result = JSON.parse(str);
  } catch (e) {
    return false;
  }
  return result;
}

//TODO add container name get via balena cli, if not respond localhost
function getBalenaContainerName() {
  return new Promise((resolve, reject) => {
    resolve("localhost:3000");
  });
}

function deleteFiles(files) {
  return new Promise((resolve, reject) => {
    let i = files.length;
    if (i <= 0) {
      resolve();
    }
    files.forEach((filepath) => {
      console.log("[FILES] Del File from Live:" + filepath);
      fs.unlink(filepath, (err) => {
        i--;
        if (err) {
          reject(err);
        } else if (i <= 0) {
          resolve();
        }
      });
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
        console.log("[SYNC] source: " + curSource + "  to: " + targetFolder + "/" + file);
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
    if (ISDEBUG) console.log("[FILES] No Files to Clean");
  }
};

const deleteFolderRecursiveNew = function (filepath) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(filepath)) {
      fs.readdir(filepath, (err, files) => {
        if (err) {
          reject(err);
        } else {
          Promise.all(
            files.map((file) => {
              return new Promise((resolve, reject) => {
                const curPath = path.join(filepath, file);
                fs.lstat(curPath, (err, stats) => {
                  if (err) {
                    reject(err);
                  } else {
                    if (stats.isDirectory()) {
                      deleteFolderRecursiveNew(curPath)
                        .then(() => {
                          resolve();
                        })
                        .catch((err) => {
                          reject(err);
                        });
                    } else {
                      fs.unlink(curPath, (err) => {
                        if (err) {
                          reject(err);
                        } else {
                          resolve();
                        }
                      });
                    }
                  }
                });
              });
            })
          )
            .then(() => {
              fs.rmdir(filepath, (err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            })
            .catch((err) => {
              reject(err);
            });
        }
      });
    } else {
      resolve(true);
      if (ISDEBUG) console.log("[FILES] No Files to Clean");
    }
  });
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

const downloadHttps = async function (inputUrl) {
  return new Promise((resolve, reject) => {
    const reqUrl = new URL(inputUrl);
    var request = https.request(
      {
        path: reqUrl.pathname + reqUrl.search,
        hostname: reqUrl.hostname,
      },
      function (response) {
        if (response.statusCode < 200 || response.statusCode > 299) {
          reject("[DLFETCH] ERR failed to load page, status code: " + response.statusCode);
          return;
        }
        response.setEncoding("utf8");
        var data = "";
        response.on("data", function (chunk) {
          data += chunk;
        });
        response.on("end", () => {
          resolve(data);
        });
      }
    );
    request.on("error", (err) => {
      reject("[DLFETCH] ERR request error " + err);
    });
    request.end();
  });
};

const downloadUrl = async function (url_dl, cb = null) {
  return new Promise((resolve, reject) => {
    const reqUrl = new URL(url_dl);
    //console.log(reqUrl);
    let dlHost = reqUrl.host;
    let dlDest = reqUrl.pathname + reqUrl.search;

    let dest = reqUrl.pathname;
    let dest_string = dest.indexOf("/") == 0 ? dest.substring(1) : dest;

    if (!fs.existsSync(LIVE_FOLDER + "/" + dest_string) && !fs.existsSync(UPDATE_FOLDER + "/" + dest_string)) {
      let folders = dest_string.split("/");
      let j;
      let struct = UPDATE_FOLDER + "/";
      if (!fs.existsSync(struct)) {
        fs.mkdirSync(struct);
      }
      for (j = 0; j < folders.length - 1; j++) {
        struct = struct + folders[j];
        if (fs.existsSync(struct) && !fs.existsSync(struct + "/")) {
          console.log("[DOWNLOADER] del file blocking folder " + struct);
          fs.unlinkSync(struct);
        }
        struct = struct + "/";
        if (!fs.existsSync(struct)) {
          fs.mkdirSync(struct);
        }
      }
      var file = fs.createWriteStream(UPDATE_FOLDER + "/" + dest_string);

      var request = http
        .get(
          {
            path: dlDest,
            hostname: dlHost,
          },
          function (response) {
            if (response.statusCode < 200 || response.statusCode > 299) {
              //console.log("Error Code:" + response.statusCode + " URL: " + url_dl);
              fs.unlink(UPDATE_FOLDER + "/" + dest_string, function () {
                console.log("[DOWNLOADER] Error Code:" + response.statusCode + " Del File: " + UPDATE_FOLDER + "/" + dest_string);
              });
              resolve(false);
              return;
            }
            response.pipe(file);

            var download_size = Math.round(response.headers["content-length"] / 1048576);
            var download_log = setInterval(function () {
              var stats = fs.statSync(UPDATE_FOLDER + "/" + dest_string);
              var size = Math.round(stats.size / 1048576);
              console.log("[DOWNLOADER] status: " + Math.round((size / download_size) * 100) + "% (" + download_size + " MB)");
            }, 2000);

            file.on("finish", function () {
              clearInterval(download_log);
              //if (ISDEBUG) console.log("[DLURL] Finished URL: " + url_dl);
              file.close(resolve(true));
            });
          }
        )
        .on("error", function (err) {
          // Handle errors
          console.log("[DOWNLOADER] err: " + err);
          fs.unlink(UPDATE_FOLDER + "/" + dest_string, function () {
            console.log("error");
            resolve(err.message);
          }); // Delete the file async. (But we don't check the result)
        });
    } else {
      if (ISDEBUG) console.log("[DOWNLOADER] file exists");
      resolve(false);
    }
  });
};

const downloadFile = async function (fetchData, cli_index = 0, forceDownload = false) {
  return new Promise(async (resolve, reject) => {
    if (!fetchData.hasOwnProperty("path")) {
      console.log("[DOWNLOADER] No Path provided for Element: " + cli_index);
      resolve(false);
    }
    var destination = fetchData.path;
    var fetchRequest = fetchData.fetch;
    if ((!fs.existsSync(LIVE_FOLDER + "/" + destination) && !fs.existsSync(UPDATE_FOLDER + "/" + destination)) || forceDownload) {
      var folders = destination.split("/");
      var j;
      var struct = UPDATE_FOLDER + "/";
      if (!fs.existsSync(struct)) {
        fs.mkdirSync(struct);
      }
      for (j = 0; j < folders.length - 1; j++) {
        struct = struct + folders[j];
        if (fs.existsSync(struct) && !fs.existsSync(struct + "/")) {
          console.log("[DOWNLOADER] del file blocking folder " + struct);
          fs.unlinkSync(struct);
        }
        struct = struct + "/";
        if (!fs.existsSync(struct)) {
          fs.mkdirSync(struct);
        }
      }
      const res = await fetch(fetchRequest.url, fetchRequest.request);
      const fileStream = fs.createWriteStream(UPDATE_FOLDER + "/" + destination, { flags: "wx" });
      let fetchResult = await new Promise((resolve, reject) => {
        if (ISDEBUG) console.log("[DOWNLOADER] Downloading: " + destination);
        let downloadedBytes = 0;
        const totalBytes = res.headers.get("content-length");
        res.body.pipe(fileStream);
        res.body.on("data", (chunk) => {
          // downloadedBytes += chunk.length;
          // const progress = Math.round((downloadedBytes / totalBytes) * 100);
          //process.stdout.write(`Downloaded ${progress}%\r`);
        });
        res.body.on("error", function (err) {
          console.log("[DOWNLOADER] ERR fetch: " + err);
          resolve(false);
        });
        fileStream.on("finish", resolve);
      });
      //URL_IGNORES TODO: add files that filed multible times to ignore list

      resolve(true);
    } else {
      if (ISDEBUG) console.log("[DOWNLOADER] file exists: " + destination);
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
      console.log("[SETVAR] " + ENV + " from ENV to: ***");
    } else {
      console.log("[SETVAR] " + ENV + " from ENV to: " + eval("process.env." + ENV));
    }
    return eval("process.env." + ENV);
  } else {
    if (secret) {
      console.log("[SETVAR] " + ENV + " from Default to: ***");
    } else {
      console.log("[SETVAR] " + ENV + " from Default to: " + alt_var);
    }
    return alt_var;
  }
}

export const configparser = {
  //Get all Download links from json
  init: function (basepath, baseurl, isdebug = false, l_folder = "update_live", u_folder = "update_tmp") {
    return new Promise((resolve, reject) => {
      console.log("---INIT FILESYNC---");
      BASEPATH = checkENV("BASEPATH", basepath); //Path to the directory for downloads (app dir default)
      UPDATE_FOLDER = checkENV("UPDATE_FOLDER", u_folder); //folder to save files in update
      LIVE_FOLDER = checkENV("LIVE_FOLDER", l_folder); //folder to save files when download done
      BASE_URL = checkENV("BASE_URL", baseurl, true); //url to config json with files
      ISDEBUG = checkBool(checkENV("ISDEBUG", isdebug)); //enable debug for console output
      deleteFolderRecursive(UPDATE_FOLDER);
      console.log("---INIT DONE--- ");
      resolve(true);
    });
  },
  //ToDo: Clean JSON from not downloadable URLs

  parseFetch: function (address = BASE_URL) {
    return new Promise(async (resolve, reject) => {
      let downloadData = await downloadHttps(address);

      let responseJson = IsJsonString(downloadData);
      //console.log("[PARSE] Session: %j", json);
      if (responseJson == false) {
        reject("[PARSE] ERR response is no valid json");
        return;
      }
      let rawData = JSON.stringify(responseJson);
      let fetchData = responseJson.data;
      //URL_IGNORES TODO: check if urls not work and exclude from array of fetch data
      if (ISDEBUG) console.log("[PARSE] " + fetchData.length + " urls found");

      resolve({ fetchData, configFile: rawData });
    });
  },

  parseUrls: function (file) {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(BASEPATH + "/" + LIVE_FOLDER + "/" + file)) {
        resolve([]);
      }
      let fileData = fs.readFileSync(BASEPATH + "/" + LIVE_FOLDER + "/" + file).toString();

      fileData = fileData.replace(/\\n/g, "\n");
      let urls_data = Array.from(getUrls(fileData, { requireSchemeOrWww: true, exclude: URL_IGNORES }));

      /*
            if (ISDEBUG) console.log("[PARSEURL] Excluded URLs");
      if (ISDEBUG) console.log(URL_IGNORES);
      URL_IGNORES.forEach((element) => {
        if (urls_data.indexOf(element) > -1) {
          let index = urls_data.indexOf(element);
          if (ISDEBUG) console.log("Found index in Output " + index);
          urls_data.splice(index, index + 1);
          //In the array!
        }
      });

      */
      resolve(urls_data);
    });
  },

  //Download Configs to Temp Dir
  downloadFetch: async function (fetchData, configFile, forceDownload) {
    return new Promise(async (resolve, reject) => {
      let configSync = false;
      if (fs.existsSync(BASEPATH + "/" + LIVE_FOLDER + "/config.json")) {
        if (fs.readFileSync(BASEPATH + "/" + LIVE_FOLDER + "/config.json") == configFile) {
          configSync = true;
          if (ISDEBUG) console.log("[DLFETCH] config up to date");
          resolve("sync");
          return;
        } else {
          configSync = false;
        }
        if (ISDEBUG) console.log("[DLFETCH] config updated: " + configSync);
      }
      if (ISDEBUG) console.log("[DLFETCH] " + fetchData.length + " files to download");
      await deleteFolderRecursiveNew(UPDATE_FOLDER);
      let downloadsSkipped = 0;
      try {
        await async.forEachOfLimit(fetchData, 5, (value, key, callback) => {
          downloadFile(value, key, forceDownload).then(function (status) {
            if (ISDEBUG && status) console.log("[DLFETCH] File OK: " + value.path);
            if (!status) downloadsSkipped++;
            callback();
          });
        });
        if (ISDEBUG) console.log("[DLFETCH] done - skipped:" + downloadsSkipped + " from: " + fetchData.length);
        if (downloadsSkipped == fetchData.length && fs.existsSync(BASEPATH + "/" + LIVE_FOLDER + "/config.json")) {
          //fs.writeFileSync(BASEPATH + "/" + LIVE_FOLDER + "/config.json", configFile);
          resolve("sync");
        } else {
          resolve(true);
        }
      } catch (error) {
        console.error("[DLFETCH] error: " + err);
        reject(err);
      }
    });
  },
  downloadUrls: async function (urls) {
    return new Promise(async (resolve, reject) => {
      if (ISDEBUG) console.log("[DLURL] " + urls.length + " files to download");
      if (ISDEBUG) console.log(urls);

      if (typeof urls === "undefined" && !urls.length > 0) {
        console.log("[DLURL] no URLs to download");
        resolve(false);
      }
      await deleteFolderRecursiveNew(UPDATE_FOLDER);
      let downloadsSkipped = 0;
      async
        .forEachOfLimit(urls, 5, (value, key, callback) => {
          downloadUrl(value, key).then(function (status) {
            let reqUrl = new URL(value);
            if (ISDEBUG && status) console.log("[DLURL] File OK: " + reqUrl.host + reqUrl.pathname);
            if (!status == true) downloadsSkipped++;
            callback();
          });
        })
        //downloadFile(urls[4], null)
        .then(() => {
          if (ISDEBUG) console.log("[DLURL] Done - skipped:" + downloadsSkipped + " from: " + urls.length);
          //no files downloaded, all on storage
          if (downloadsSkipped == urls.length) {
            resolve("sync");
          } else {
            resolve(true);
          }
        })
        .catch((err) => {
          console.error("[DLURL] Error: " + err);
          reject(err);
        });
    });
  },
  //Copy Temp Downloads to Live System
  sync: async function () {
    return new Promise(async (resolve, reject) => {
      if (fs.existsSync(UPDATE_FOLDER)) {
        if (ISDEBUG) console.log("[SYNC] copy to live folder...");
        copyFolderRecursiveSync(UPDATE_FOLDER, LIVE_FOLDER);
        resolve(true);
      } else {
        if (ISDEBUG) console.log("[SYNC] no temp folder - no files to sync");
        resolve("sync");
      }
    });
  },
  clean: async function (fetchData, configFile, directFiles) {
    return new Promise(async (resolve, reject) => {
      let filesInput = fetchData;
      if (ISDEBUG) console.log("[CLEAN] start");
      if (!fs.existsSync(LIVE_FOLDER)) {
        fs.mkdirSync(LIVE_FOLDER);
      }
      const files = await new Promise((resolve, reject) => {
        listFilesRecursive(LIVE_FOLDER, async function (err, result) {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
      console.log("[CLEAN] files in drive:");
      console.log(files);

      for (let index = 0; index < fetchData.length; index++) {
        let element;
        if (directFiles) {
          element = BASEPATH + "/" + LIVE_FOLDER + "/" + fetchData[index];
        } else {
          element = BASEPATH + "/" + LIVE_FOLDER + "/" + fetchData[index].path;
        }
        let checkFile = files.includes(element);
        if (checkFile) {
          let element_index = files.indexOf(element);
          files.splice(element_index, 1);
        }
      }
      //getBalenaContainerName()
      files.splice(files.indexOf(BASEPATH + "/" + LIVE_FOLDER + "/config.json", configFile), 1);
      fs.writeFileSync(BASEPATH + "/" + LIVE_FOLDER + "/config.json", configFile);
      //Filter config.json not to delete
      console.log(files);
      await deleteFiles(files);
      console.log("[SYNC] all files that are not in JSON removed");
      console.log("---UPDATE ALL DONE---");
      await deleteFolderRecursiveNew(UPDATE_FOLDER);
      resolve(true);
    });
  },
  urlReplace: async function (filesList, urlsList) {
    return new Promise(async (resolve, reject) => {
      if (ISDEBUG) console.log("[URLREPLACE] start");

      let fileDomain = await getBalenaContainerName();
      let returnConfigFiles = [];
      for (let index = 0; index < filesList.length; index++) {
        let baseFilePath = BASEPATH + "/" + LIVE_FOLDER + "/" + filesList[index];
        if (ISDEBUG) console.log("[URLREPLACE] check elem: " + baseFilePath);

        if (!fs.existsSync(baseFilePath)) continue;

        let configFile = fs.readFileSync(baseFilePath).toString();
        configFile = configFile.replace(/:\/\/www\./g, "://");

        for (let index = 0; index < urlsList.length; index++) {
          const urlData = new URL(urlsList[index]);
          let searchdata = urlData.search.replace(/\//g, "%2F");
          let searchUrl = urlData.origin + urlData.pathname + searchdata;
          let replaceUrl = "http://" + fileDomain + urlData.pathname;
          configFile = configFile.replace(searchUrl, replaceUrl);
        }

        //let configFileName = filesList[index].replace(/\/([^/]+)\.([^/.]+)$/, "/$1_files.$2");
        let configFileName = filesList[index].replace(/([^/]+)\.(\w+)$/, "$1_files.$2");
        returnConfigFiles.push(configFileName);

        if (fs.existsSync(BASEPATH + "/" + LIVE_FOLDER + "/" + configFileName)) {
          fs.unlinkSync(BASEPATH + "/" + LIVE_FOLDER + "/" + configFileName);
        }
        fs.writeFileSync(BASEPATH + "/" + LIVE_FOLDER + "/" + configFileName, configFile);
      }
      resolve(returnConfigFiles);
    });
  },
  get_content_dir: function () {
    return LIVE_FOLDER;
  },
  check_env_var: function (sysvar, altvar, secret) {
    return checkENV(sysvar, altvar, secret);
  },
};
