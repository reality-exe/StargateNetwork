import "dotenv/config";
import { WebSocketServer } from "ws";
import {
  DialRequest,
  RequestAddress,
  Type,
  UpdateData,
  ValidateAddress,
} from "./types/message-types/Messages";
import pb, { findGate } from "./services/pocketbase.service";
import { GateStatus, Stargate } from "./types/Stargate";
import {
  GateStatusCache,
  SessionCache,
} from "./types/message-types/SessionCache";
import { Relay } from "./types/Relay";

global.EventSource = require("eventsource");

const wss = new WebSocketServer({
  host: "0.0.0.0",
  port: process.env.WS_PORT as unknown as number,
});

wss.on("error", console.error);

wss.on("connection", async (wsc, req) => {
  console.log(
    `${new Date()} | New connection from ${req.socket.remoteAddress}`
  );
  let session_cache: SessionCache = {
    gate_id: "",
    gate_address: "",
    gate_code: "",
    gate_owner: "",
    session_url: "",
    gate_status: GateStatusCache.Idle,
    connection_status: {
      gate_id: "",
      gate_address: "",
      gate_code: "",
      gate_iris: false,
    },
  };

  let unsub_sg = await pb
    .collection("stargates")
    .subscribe<Stargate>("*", (data) => {
      if (data.record.gate_address != session_cache.gate_address) return;
      if (data.record.gate_status != "OPEN") {
        switch (data.record.gate_status) {
          case GateStatus.IDLE:
            if (session_cache.gate_status == GateStatusCache.Incoming) {
              session_cache.gate_status = GateStatusCache.Idle;
              wsc.send("Impulse:CloseWormhole");
              break;
            }
            break;
          case GateStatus.INCOMING7:
            session_cache.gate_status = GateStatusCache.Incoming;
            wsc.send("Impulse:OpenIncoming:7");
            break;
          case GateStatus.INCOMING8:
            session_cache.gate_status = GateStatusCache.Incoming;
            wsc.send("Impulse:OpenIncoming:8");
            break;
          case GateStatus.INCOMING9:
            session_cache.gate_status = GateStatusCache.Incoming;
            wsc.send("Impulse:OpenIncoming:9");
            break;
          default:
            break;
        }
      }
    });
  let unsub_relay = await pb
    .collection("stargate_relay")
    .subscribe<Relay>("*", (data) => {
      console.log(data);
      if (data.record.to == session_cache.gate_address) {
        wsc.send(data.record.relay);
      }
    });
  wsc.on("close", async (code, reason) => {
    console.log(
      `${new Date()} | Connection from ${
        req.socket.remoteAddress
      } closed. Code: ${code}`
    );
    await unsub_sg();
    await unsub_relay();

    if (session_cache.gate_id != "") {
      pb.collection("stargates").delete(session_cache.gate_id);
    }
  });

  wsc.on("message", async (stream) => {
    let msg = stream.toString();
    if (msg.slice(0, 1) == "{") {
      let json = JSON.parse(msg);
      switch (json.type) {
        case Type.RequestAddress:
          let data = json as RequestAddress;
          if (session_cache.gate_address != "") break;
          console.log(
            `${new Date()} | New address request: ${data.gate_address} from ${
              req.socket.remoteAddress
            }`
          );
          let gate_check = await findGate(data.gate_address);
          if (gate_check) {
            console.log(
              `${new Date()} | Denied gate address ${data.gate_address} from ${
                req.socket.remoteAddress
              }`
            );
            wsc.send("403");
            break;
          }

          let new_gate = {
            active_users: data.current_users,
            gate_address: data.gate_address,
            gate_code: data.gate_code,
            gate_status: GateStatus.IDLE,
            iris_state: false,
            is_headless: data.is_headless,
            max_users: data.max_users,
            owner_name: data.host_id,
            public_gate: data.public,
            session_name: data.gate_name,
            session_url: data.session_id,
          };

          console.log(
            `${new Date()} | Accepted gate address ${data.gate_address} from ${
              req.socket.remoteAddress
            }`
          );
          let response = await pb.collection("stargates").create(new_gate);
          session_cache.gate_id = response.id;
          session_cache.gate_address = data.gate_address;
          session_cache.gate_code = data.gate_code;
          session_cache.gate_owner = data.host_id;
          session_cache.session_url = data.session_id;
          wsc.send(`{code: 200, message: "Address accepted" }`);
          break;
        case Type.ValidateAddress:
          let v_data = json as ValidateAddress;
          var gate_address_full = v_data.gate_address;
          var gate_address = gate_address_full.slice(0, 6);
          if (v_data.gate_address.length < 6) {
            wsc.send("CSValidCheck:400");
            break;
          }
          console.log(
            `${new Date()} | Validate Address: ${v_data.gate_address}`
          );

          var gate_code = "";
          if (gate_address == session_cache.gate_address) {
            wsc.send("CSDialCheck:403");
            break;
          }
          switch (gate_address_full.length) {
            case 6:
              gate_code = session_cache.gate_code;
              console.log(`${gate_code} | ${gate_address_full.length}`);
              break;
            case 7:
              gate_code = gate_address_full.slice(6) + "@";
              console.log(`${gate_code} | ${gate_address_full.length}`);
              break;
            case 8:
              gate_code = gate_address_full.slice(6);
              console.log(`${gate_code} | ${gate_address_full.length}`);
              break;
          }

          let v_gate = await findGate(gate_address);
          if (!v_gate) {
            wsc.send("CSValidCheck:404");
            break;
          } else if (session_cache.gate_code != gate_code) {
            wsc.send("CSValidCheck:302z");
            break;
          } else if (v_gate.gate_status == GateStatus.IDLE) {
            wsc.send("CSValidCheck:200");
            break;
          } else if (
            v_gate.gate_status == GateStatus.INCOMING7 ||
            v_gate.gate_status == GateStatus.INCOMING8 ||
            v_gate.gate_status == GateStatus.INCOMING9 ||
            v_gate.gate_status == GateStatus.OPEN
          ) {
            wsc.send("CSValidCheck:403");
            break;
          }
          break;
        case Type.DialRequest:
          let dr_data = json as DialRequest;
          var gate_address_full = dr_data.gate_address;
          var gate_address = gate_address_full.slice(0, 6);
          console.log(
            `${new Date()} | Dial request from ${
              session_cache.gate_address
            } to ${gate_address_full}`
          );
          var gate_code = "";
          if (gate_address == session_cache.gate_address) {
            wsc.send("CSDialCheck:403");
            break;
          }
          switch (gate_address_full.length) {
            case 6:
              gate_code = session_cache.gate_code;
              console.log(`${gate_code} | ${gate_address_full.length}`);
              break;
            case 7:
              gate_code = gate_address_full.slice(6) + "@";
              console.log(`${gate_code} | ${gate_address_full.length}`);
              break;
            case 8:
              gate_code = gate_address_full.slice(6);
              console.log(`${gate_code} | ${gate_address_full.length}`);
              break;
          }

          let d_gate = await findGate(gate_address);
          if (!d_gate) {
            wsc.send("CSDialCheck:404");
            break;
          } else if (d_gate.gate_code != gate_code) {
            wsc.send("CSDialCheck:302");
            break;
          } else if (d_gate.active_users >= d_gate.max_users) {
            wsc.send("CSDialCheck:403");
            break;
          } else {
            let u_gate = await pb
              .collection("stargates")
              .update<Stargate>(d_gate.id, {
                gate_status: `INCOMING${gate_address_full.length + 1}`,
              });
            session_cache.gate_status = GateStatusCache.Outgoing;
            session_cache.connection_status.gate_id = u_gate.id;
            session_cache.connection_status.gate_address = u_gate.gate_address;
            session_cache.connection_status.gate_code = u_gate.gate_code;
            session_cache.connection_status.gate_iris = u_gate.iris_state;
            wsc.send("CSDialCheck:200");
            wsc.send(`CSDialedSessionURL:${u_gate.session_url}`);
            break;
          }
          break;
        case Type.CloseWormhole:
          if (session_cache.gate_status != GateStatusCache.Outgoing) break;
          let t_gate = await pb
            .collection("stargates")
            .update(session_cache.gate_id, { gate_status: "IDLE" });
          let o_gate = await pb
            .collection("stargates")
            .update(session_cache.connection_status.gate_id, {
              gate_status: "IDLE",
            });

          session_cache.gate_status = GateStatusCache.Idle;
          session_cache.connection_status.gate_id = "";
          session_cache.connection_status.gate_address = "";
          session_cache.connection_status.gate_code = "";
          session_cache.connection_status.gate_iris = false;
        case Type.UpdateData:
          let u_data = json as UpdateData
          let u_gate = await pb.collection("stargates").update(session_cache.gate_id, {
            gate_status: u_data.gate_status,
            active_users: u_data.currentUsers,
            max_users: u_data.maxUsers
          })
          break;
          default:
          break;
      }
      return;
    } else if (msg.slice(0, 3) == "IDC") {
      console.log("IDC Transmission");
      let response = await pb.collection("stargate_relay").create({
        from: session_cache.gate_address,
        relay: msg,
        to: session_cache.connection_status.gate_address,
      });
      return;
    } else {
      console.log("Message unknown");
    }
  });
});

wss.on("listening", () => {
  console.log(
    `${new Date()} | Server is now listening on port ${process.env.WS_PORT}`
  );
});
