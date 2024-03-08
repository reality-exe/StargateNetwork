const { Databases } = require("node-appwrite");

module.exports = {
  /**
   * @param {Databases} database
   * @param {String} gate_address
   * @param {Object} data Data to update
   */
  updateGate: async function (database, gate_address, data) {
    let gate = await database
      .updateDocument("sgn", "gates", gate_address.toLowerCase(), data)
      .catch((err) => {const er = err});
    return gate;
  },
};
