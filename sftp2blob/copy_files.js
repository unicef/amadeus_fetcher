var azure = require('azure-storage');
var blob = require('./get_blob_names');
var collection = require('./get_collection_file_names');
var fs = require('fs');
var config = require('../config');
var azure_key = config.azure.key1;
var connSettings = config.connectionSettings;
var storage_account = config.azure.storage_account;
var blobSvc = azure.createBlobService(storage_account, azure_key);
var local_dir = config.localStorageDir;

/**
 * Uploads data file as blob.
 * TODO Destroy local file on upload complete
 * @param{String} col - Collection name
 * @param{String} filename - Name of file
 * @param{String} local_path - Path to file
 * @return{Promise} Fulfilled with result of azure upload
 */
function upload_blob_and_destroy_file(col, filename, local_path) {
  console.log('Begin store to blob:', col, filename);
  return new Promise(function(resolve, reject) {
    blobSvc.createBlockBlobFromLocalFile(
      col,
      filename,
      local_dir + '/' + col + '/' + filename,
      function(err, result, response) {
        // TODO: Destroy local file.
        if (!err) {
          resolve(result);
        } else {
          return reject(err);
        }
      });
  });
}

/**
 * Downloads file from sftp server
 * @param{String} col - Collection name
 * @param{String} filename - Name of file
 * @return{Promise} Fulfilled with result of azure upload
 */
function download_file_and_add_blob(col, filename) {
  console.log('Download start:', col, filename);
  return new Promise(function(resolve, reject) {
    var client = require('scp2');
    var local_path = './' + local_dir + '/' + col + '/';
    client.scp({
      host: connSettings.host,
      username: connSettings.username,
      password: connSettings.password,
      path: config.remotePathToList + '/' + col + '/' + filename
    }, local_path + filename, function(err) {
      if (!err) {
        upload_blob_and_destroy_file(col, filename, local_path).then(function(value) {
          resolve(value);
        });
      } else {
        return reject(err);
      }
    });
  });
}

/**
 * Downloads file from sftp server
 * @param{String} col - Collection name
 * @param{String} file_names - List of names of files
 * @return{Promise} Fulfilled with result of file download and azure upload
 */
function download_files_and_add_blobs(col, file_names) {
  return new Promise(function(resolve, reject) {
    file_names.forEach(function(filename) {
      download_file_and_add_blob(col, filename)
      .then(
        value => resolve()
      );
    });
  });
}

/**
 * Downloads file from sftp server
 * @param{String} col - Collection name
 * @return{Promise} Fulfilled with result of azure upload
 */
function download_col_upload_blob(col) {
  // Compare files in sftp collection and blob storage.
  // Download files in sftp and not in blob
  return new Promise(function(resolve, reject) {
    collection.get_file_names(col).then(function(files) {
      blob.get_blobs_list(col).then(function(blobs) {
        var file_names = files.map(file => file.filename);
        var new_files = file_names.filter(function(e) {
          return blobs.indexOf(e) === -1;
        });
        if (new_files.length > 0) {
          download_files_and_add_blobs(col, new_files).then(function() {
            resolve();
          });
        } else {
          console.log('No new files in', col);
          resolve();
        }
      });
    });
  });
}

/**
 * Downloads file from sftp server
 * @param{String} list - List of collections
 * @return{Promise} Fulfilled with result of collection upload to blob
 */
exports.download_collection_upload_blob = function(list) {
  return new Promise(function(resolve, reject) {
    var collections = list.map(col => col.name);
    var promises = [];
    collections.forEach(function(col) {
      // Create direcotry in local storage for collection if it doesn't already exist.
      var dir = local_dir + '/' + col;
      if (!fs.existsSync(dir)) {
        fs.mkdir(dir, function(err) {
          if (err) {
            return reject(err);
          }
        });
      }
      promises.push(download_col_upload_blob(col));
    });
    Promise.all(promises).then(function() {
      resolve();
    });
  });
};