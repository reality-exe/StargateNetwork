const { Databases, Query } = require("node-appwrite");

module.exports = {
  /**
   *
   * @param {Databases} database
   * @param {String} gate_address
   */
  getGate: async function (database, gate_address) {
    let gate = await database
      .getDocument("sgn", "gates", gate_address.toLowerCase())
      .catch((err) => {const er = err});
    return gate;
  },
};
