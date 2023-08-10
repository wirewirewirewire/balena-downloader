import https from "https";
import url from "url";
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

function deleteFiles(files, callback) {
  var i = files.length;
  files.forEach(function (filepath) {
    console.log("[FILES] Del File from Live:" + filepath);
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
          reject("[DLURL] ERR failed to load page, status code: " + response.statusCode);
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
      reject("[DLURL] ERR request error " + err);
    });
    request.end();
  });
};

const downloadFile = async function (fetchData, cli_index = 0, cb = null) {
  return new Promise(async (resolve, reject) => {
    if (!fetchData.hasOwnProperty("path")) {
      console.log("[DOWNLOADER] No Path provided for Element: " + cli_index);
      resolve(false);
    }
    var destination = fetchData.path;
    var fetchRequest = fetchData.fetch;
    if (!fs.existsSync(LIVE_FOLDER + "/" + destination) && !fs.existsSync(UPDATE_FOLDER + "/" + destination)) {
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
        console.log("[DOWNLOADER] Downloading: " + destination + " - ");
        let downloadedBytes = 0;
        const totalBytes = res.headers.get("content-length");
        res.body.pipe(fileStream);
        res.body.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          const progress = Math.round((downloadedBytes / totalBytes) * 100);
          process.stdout.write(`Downloaded ${progress}%\r`);
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

  parseUrls: function (address = BASE_URL) {
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

  //Download Configs to Temp Dir
  download: async function (fetchData, configFile) {
    return new Promise(async (resolve, reject) => {
      let configSync = false;
      if (fs.existsSync(BASEPATH + "/" + LIVE_FOLDER + "/config.json")) {
        if (fs.readFileSync(BASEPATH + "/" + LIVE_FOLDER + "/config.json") == configFile) {
          configSync = true;
          resolve("sync");
          return;
        } else {
          configSync = false;
        }
        if (ISDEBUG) console.log("[DOWNLOAD] config updated: " + configSync);
      }
      if (ISDEBUG) console.log("[DOWNLOAD] " + fetchData.length + " files to download");
      let newdl_counter = 0;
      try {
        await async.forEachOfLimit(fetchData, 5, (value, key, callback) => {
          downloadFile(value, key).then(function (status) {
            if (ISDEBUG && status) console.log("[DOWNLOAD] File OK: " + value.path);
            if (!status) newdl_counter++;
            callback();
          });
        });
        if (ISDEBUG) console.log("[DOWNLOAD] done - skipped:" + newdl_counter + " from: " + fetchData.length);
        resolve(true);
      } catch (error) {
        console.error("[DOWNLOAD] error: " + err);
        reject(err);
      }
    });
  },
  //Copy Temp Downloads to Live System
  sync: function () {
    if (fs.existsSync(UPDATE_FOLDER)) {
      if (ISDEBUG) console.log("[SYNC] begin");
      copyFolderRecursiveSync(UPDATE_FOLDER, LIVE_FOLDER);
    } else {
      if (ISDEBUG) console.log("[SYNC] no temp folder - no files to sync");
    }
  },
  clean: function (fetchData, configFile) {
    if (ISDEBUG) console.log("[CLEAN] start");
    if (!fs.existsSync(LIVE_FOLDER)) {
      fs.mkdirSync(LIVE_FOLDER);
    }
    listFilesRecursive(LIVE_FOLDER, function (err, result) {
      console.log("[CLEAN] files in drive:");
      console.log(result);
      for (let index = 0; index < fetchData.length; index++) {
        let element = BASEPATH + "/" + LIVE_FOLDER + "/" + fetchData[index].path;
        let checkFile = result.includes(element);
        if (checkFile) {
          let element_index = result.indexOf(element);
          result.splice(element_index, 1);
        }
      }
      result.splice(result.indexOf(BASEPATH + "/" + LIVE_FOLDER + "/config.json", configFile), 1);
      fs.writeFileSync(BASEPATH + "/" + LIVE_FOLDER + "/config.json", configFile);
      //Filter config.json not to delete
      deleteFiles(result, function (err) {
        if (err) {
          console.log(err);
        } else {
          console.log("[SYNC] all files that are not in JSON removed");
        }
      });
    });
    deleteFolderRecursive(UPDATE_FOLDER);
    console.log("---UPDATE ALL DONE---");
  },
  get_content_dir: function () {
    return LIVE_FOLDER;
  },
  check_env_var: function (sysvar, altvar, secret) {
    return checkENV(sysvar, altvar, secret);
  },
};
