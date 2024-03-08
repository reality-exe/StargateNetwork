require("dotenv").config();
const { Client, Databases, Query, Account } = require("node-appwrite");
const http = require("http");
const WebSocketServer = require("websocket").server;

const { createGate } = require("./functions/createGate");
const { getGate } = require("./functions/getGate");
const { deleteGate } = require("./functions/deleteGate");
const { updateGate } = require("./functions/updateGate");

const {
  appwrite_url,
  appwrite_project,
  appwrite_key,
  appwrite_database,
  appwrite_collection,
} = process.env;

const server = http.createServer((request, response) => {
  console.log(`${new Date()} | Received request for ${request.url}`);
  response.writeHead(404);
  response.end();
});

const client = new Client()
  .setEndpoint(appwrite_url)
  .setProject(appwrite_project)
  .setKey(appwrite_key);

const database = new Databases(client);
var session_cache = {
  gate_address: null,
  gate_code: null,
  gate_owner: null,
  connection_status: {
    outgoing: false,
    c_gate_address: null,
    c_gate_code: null,
    c_gate_iris: false,
  },
};

let wsServer = new WebSocketServer({
  httpServer: server,
});

server.listen(6262, async () => {
  console.log(`${new Date()} | Server now listening on port 6262`);

  console.log(`${new Date()} | Checking network database...`);
  let documents = await database.listDocuments("sgn", "gates");
  if (documents.total != 0) {
    for (let i = 0; i < documents.documents.length; i++) {
      const element = documents.documents[i];
      console.log(`${new Date()} | Removing ${element.$id}...`);
      await database.deleteDocument("sgn", "gates", element.$id);
    }
    console.log(`${new Date()} | Cleared database`);
  } else {
    console.log(`${new Date()} | No gates in database`);
  }
});

wsServer.on("request", (request) => {
  let connection = request.accept(null);
  var databaseSub;
  console.log(`${new Date()} | Connection opened from ${request.origin}`);
  connection.on("message", async (message) => {
    let json = JSON.parse(message.utf8Data);
    switch (json.type) {
      case "requestAddress":
        console.log(
          `${new Date()} | Address request recieved from ${request.origin} (${
            json.gate_address
          })`
        );
        let gate = await getGate(database, json.gate_address);
        if (gate != undefined) {
          console.log(
            `${new Date()} | Address "${
              json.gate_address
            }" denied, gate already exists. Origin: ${request.origin}`
          );
          connection.send("403");
          break;
        }
        let new_gate = await createGate(
          database,
          json.gate_address,
          json.gate_code,
          json.host_id,
          json.session_id,
          json.gate_name,
          json.current_users,
          json.max_users,
          json.public,
          json.is_headless
        );
        session_cache.gate_address = json.gate_address;
        session_cache.gate_code = json.gate_code;
        session_cache.gate_owner = json.host_id;
        connection.send(`{ code: 200, message: "Address accepted" }`);
        console.log(
          `${new Date()} | Address request accepted, adding ${
            session_cache.gate_address
          } to the database`
        );
        databaseSub = setInterval(async () => {
          let gate = await getGate(database, session_cache.gate_address);
          if (gate.gate_status != "IDLE" && gate.gate_status != "OPEN") {
            connection.send(`Impulse:${gate.gate_status}`);
            updateGate(database, session_cache.gate_address, {
              gate_status: "OPEN",
            });
          }
        }, 1000);
        break;

      case "validateAddress":
        if (json.gate_address.length < 6) {
          connection.send("CSValidCheck:400");
        }

        let v_gate = await getGate(database, json.gate_address);
        if (!v_gate) {
          connection.send("CSValidCheck:404");
          break;
        } else if (v_gate.gate_status == "IDLE") {
          connection.send("CSValidCheck:200");
          break;
        } else if (v_gate.gate_status == "OPEN") {
          connection.send("CSValidCheck:403");
          break;
        }
        break;
      default:
        break;
    }
  });
  connection.on("close", (code, desc) => {
    console.log(
      `${new Date()} | Connection closed from ${request.origin}. Code: ${code}`
    );
    if (session_cache.gate_address != null) {
      console.log(
        `${new Date()} | Removing gate entry from database (${
          session_cache.gate_address
        })`
      );
      clearInterval(databaseSub);
      deleteGate(database, session_cache.gate_address);
    }
  });
});
