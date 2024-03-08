require("dotenv").config();
const { Client, Account } = require("appwrite");
const client = new Client()
  .setEndpoint(process.env.appwrite_url)
  .setProject(process.env.appwrite_project);
const account = new Account(client);

module.exports = {
  /**
   * @param {*} session_cache
   */
  dbSubscribe: function (session_cache) {
    async function gateCheck() {
      console.log(session_cache.gate_address)
    }
    return gateCheck();
  },
};
