const { Databases, Query } = require("node-appwrite");

module.exports = {
  /**
   * @param {Databases} database
   * @param {String} gate_address
   */
  deleteGate: async function (database, gate_address) {
    let gate = await database
      .deleteDocument("sgn", "gates", gate_address.toLowerCase())
      .catch((err) => {const er = err});
    return gate;
  },
};
