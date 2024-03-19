require("dotenv").config();
const { WindowMock } = require("window-mock");
const c_appwrite = require("appwrite");
const { Client, Databases, Query, Account } = require("node-appwrite");
const http = require("http");
const WebSocketServer = require("websocket").server;
const WebSocketClient = require("websocket").client;

const { createGate } = require("./functions/createGate");
const { getGate } = require("./functions/getGate");
const { deleteGate } = require("./functions/deleteGate");
const { updateGate } = require("./functions/updateGate");
const databaseSubscribe = require("./functions/databaseSubscribe");

const {
  appwrite_url,
  appwrite_project,
  appwrite_key,
  appwrite_database,
  appwrite_collection,
  appwrite_realtime,
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
  var wsc = new WebSocketClient();
  console.log(
    `${new Date()} | Connection opened from ${request.remoteAddress}`
  );
  var session_cache = {
    gate_address: null,
    gate_code: null,
    gate_owner: null,
    session_url: null,
    incoming: false,
    connection_status: {
      outgoing: false,
      gate_address: null,
      gate_code: null,
      gate_iris: false,
    },
  };
  connection.on("message", async (message) => {
    let json = JSON.parse(message.utf8Data);

    switch (json.type) {
      case "requestAddress":
        console.log(
          `${new Date()} | Address request recieved from ${
            request.remoteAddress
          } (${json.gate_address})`
        );
        if (json.session_id == session_cache.session_url) {
          connection.send('{ code: 200, message: "Address accepted" }');
          break;
        }
        let gate = await getGate(database, json.gate_address);
        if (gate != undefined) {
          console.log(
            `${new Date()} | Address "${
              json.gate_address
            }" denied, gate already exists. Origin: ${request.remoteAddress}`
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
        session_cache.session_url = json.session_id;
        connection.send(`{ code: 200, message: "Address accepted" }`);
        console.log(
          `${new Date()} | Address request accepted, adding ${
            session_cache.gate_address
          } to the database`
        );

        // Appwrite realtime
        wsc = new WebSocketClient();

        wsc.on("connectFailed", (err) => {
          console.log(
            `${new Date()} | Realtime connection error: ${err.toString()}`
          );
        });

        wsc.on("connect", (con) => {
          con.on("error", (err) => {
            console.log(`${new Date()} | Realtime connection error ${err}`);
          });

          // Close realtime client connection on server client disconnect.
          connection.on("close", (c, d) => {
            con.close();
          });

          con.on("message", (message) => {
            let json = JSON.parse(message.utf8Data);
            switch (json.type) {
              case "connected":
                console.log(
                  `${new Date()} | Connected to Appwrite's realtime websocket`
                );
                break;
              case "event":
                let data = json.data.payload;

                if (data.gate_address == session_cache.gate_address) {
                  switch (data.gate_status) {
                    case "IDLE":
                      if (session_cache.incoming) {
                        session_cache.incoming = false;
                        connection.send("Impulse:CloseWormhole");
                        break;
                      }
                      break;
                    case "OUTGOING":
                      break;
                    case "INCOMING7":
                      session_cache.incoming = true;
                      connection.send("Impulse:OpenIncoming:7");
                      break;
                    case "INCOMING8":
                      session_cache.incoming = true;
                      connection.send("Impulse:OpenIncoming:8");
                      break;
                    case "INCOMING9":
                      session_cache.incoming = true;
                      connection.send("Impulse:OpenIncoming:9");
                      break;

                    default:
                      break;
                  }
                }
                break;
              default:
                break;
            }
          });
        });
        // Connect to appwrite's realtime websocket server
        wsc.connect(appwrite_realtime);

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
      case "dialRequest":
        var gate_address_full = json.gate_address;
        var gate_address = gate_address_full.slice(0, 6);
        if (gate_address == session_cache.gate_address) {
          connection.send("CSDialCheck:403");
          break;
        }

        switch (gate_address_full.length) {
          case 6:
            var gate_code = session_cache.gate_code;
            break;
          case 7:
            var gate_code = gate_address_full.slice(6) + "@";
            break;
          case 8:
            var gate_code = gate_address_full.slice(6);
            break;
        }
        let c_gate = await getGate(database, gate_address);
        if (c_gate == null) {
          connection.send("CSDialCheck:404");
          break;
        } else if (c_gate.active_players == c_gate.max_players) {
          connection.send("CSDialCheck:403");
        } else {
          let u_gate = await updateGate(database, gate_address, {
            gate_status: `INCOMING${gate_address_full.length + 1}`,
          });
          session_cache.connection_status.outgoing = true;
          session_cache.connection_status.gate_address = u_gate.gate_address;
          session_cache.connection_status.gate_code = u_gate.gate_code;
          session_cache.connection_status.gate_iris = false;
          connection.send("CSDialCheck:200");
          connection.send(`CSDialedSessionURL:${u_gate.session_url}`);
        }
        break;
      case "closeWormhole":
        let _thisGate = await updateGate(database, session_cache.gate_address, {
          gate_status: "IDLE",
        });
        let _otherGate = await updateGate(
          database,
          session_cache.connection_status.gate_address,
          { gate_status: "IDLE" }
        );
        session_cache.connection_status.outgoing = false;
        session_cache.connection_status.gate_address = null;
        session_cache.connection_status.gate_code = null;
        session_cache.connection_status.gate_iris = false;
        break;
      case "updateData":
        if (session_cache.gate_address != null) {
          let data = await updateGate(database, session_cache.gate_address, {
            gate_status: json.gate_status,
            active_users: json.currentUsers,
            max_users: json.maxUsers,
          });
        }
        break;
      default:
        break;
    }
  });
  connection.on("close", (code, desc) => {
    console.log(
      `${new Date()} | Connection closed from ${
        request.remoteAddress
      }. Code: ${code}`
    );
    if (session_cache.gate_address != null) {
      console.log(
        `${new Date()} | Removing gate entry from database (${
          session_cache.gate_address
        })`
      );
      // clearInterval(databaseSub);
      deleteGate(database, session_cache.gate_address);
    }
  });
});
