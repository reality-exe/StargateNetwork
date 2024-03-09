require("dotenv").config();
const { Client, Account, Databases } = require("appwrite");
const { WindowMock } = require("window-mock");

const client = new Client()
  .setEndpoint(process.env.appwrite_url)
  .setProject(process.env.appwrite_project);
const account = new Account(client);

module.exports = {
  /**
   * @param {*} session_cache
   */
  dbSubscribe: function (client, database, session_cache) {},
};
