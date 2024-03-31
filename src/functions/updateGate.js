const { Databases } = require("node-appwrite");

// Used to return a blank gate if the gate_address variable is null
const backupGate = {
  gate_address: "",
  gate_code: "",
  owner_name: "",
  session_url: "",
  session_name: "",
  active_users: -1,
  max_users: -1,
  public_gate: false,
  is_headless: false,
  gate_status: "",
  iris_state: false,
  $id: "",
  $createdAt: "",
  $updatedAt: "",
  $permissions: [],
  $databaseId: "",
  $collectionId: "",
};

module.exports = {
  /**
   * @param {Databases} database
   * @param {String} gate_address
   * @param {Object} data Data to update
   */
  updateGate: async function (database, gate_address, data) {
    if (!gate_address) {
      console.error(
        `${new Date()} | Gate address is null, skipping update to prevent socket crash.`
      );
      return;
    }
    let gate = await database
      .updateDocument("sgn", "gates", gate_address.toLowerCase(), data)
      .catch((err) => {
        const er = err;
      });
    return gate;
  },
};
