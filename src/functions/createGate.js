const { Databases } = require("node-appwrite");

module.exports = {
  /**
   *
   * @param {Databases} database
   * @param {String} gate_address
   * @param {String} gate_code
   * @param {String} owner
   * @param {String} session_url
   * @param {String} session_name
   * @param {Int16Array} active_users
   * @param {Int16Array} max_users
   * @param {Boolean} public_gate
   * @param {Boolean} is_headless
   */
  createGate: async function (
    database,
    gate_address,
    gate_code,
    owner,
    session_url,
    session_name,
    active_users,
    max_users,
    public_gate,
    is_headless
  ) {
    let gate = await database.createDocument(
      "sgn",
      "gates",
      gate_address.toLowerCase(),
      {
        gate_address: gate_address,
        gate_code: gate_code,
        owner_name: owner,
        session_url: session_url,
        session_name: session_name,
        active_users: active_users,
        max_users: max_users,
        public_gate: public_gate,
        is_headless: is_headless,
        gate_status: "IDLE",
        iris_state: false
      }
    );
    return gate;
  },
};
