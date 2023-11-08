require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const { WebSocketServer } = require("ws");
const { supabase_url, supabase_key } = process.env;

const wss = new WebSocketServer({ port: 9066 });

const supabase = createClient(supabase_url, supabase_key);
var db_channel = supabase.channel("events");
wss.on("connection", async (ws) => {
  console.log("New connection");
  var sessionData = {
    address: "",
    code: "",
    host_id: "",
    incoming: false,
  };

  function supabase_subscribe(payload) {
    console.log(payload);
    let new_data = payload.new;

    switch (new_data.gate_status) {
      case "IDLE":
        if (sessionData.incoming) {
          ws.send("Close wormhole");
          sessionData.incoming = false;
          break;
        }
        break;
      case "OUTGOING":
        break;
      case "INCOMING":
        ws.send("Incoming wormhole");
        sessionData.incoming = true;
        break;

      default:
        break;
    }
  }

  ws.on("message", async (msg) => {
    let json = JSON.parse(msg.toString());
    switch (json.type) {
      case "validateAddress":
        // Return 400 if address' length is too short
        if (json.gate_address.length < 6) {
          ws.send('{"code":400,"message":"Address too short"}');
          break;
        }

        var { data: data, error } = await supabase
          .from("gates")
          .select("*")
          .eq("gate_address", json.gate_address)
          .single();
          
        if (data == null) { // Return 404 if there is no gate with that address
          ws.send('{"code":404, "message":"Gate not found"}');
          break;
        } // Return 302 if the outgoing gate has a different group code from the dialing gate
        else if (data.gate_code != json.gate_code) {
          ws.send('{"code":302,"message":"Wrong gate code"}');
          break;
        } // Return 200 if gate exists, and is not already open
        else if (data.gate_status == "IDLE") {
          ws.send('{"code":200,"message":"Address valid"}');
          break;
        } // Return 403 if gate has an active wormhole
        else if (data.gate_status == "OPEN") {
          ws.send('{"code":403,"message":"Gate busy"}');
          break;
        }

        break;
      case "requestAddress":
        console.log("Request address");
        var { data: data } = await supabase
          .from("gates")
          .select("*")
          .eq("gate_address", json.gate_address)
          .single();

        if (data == null) {
          sessionData.address = json.gate_address;
          sessionData.code = json.gate_code;
          sessionData.host_id = json.host_id;
          var { data: data, error } = await supabase.from("gates").insert([
            {
              host_id: json.host_id,
              is_headless: json.is_headless,
              session_id: json.session_id,
              gate_address: json.gate_address,
              gate_code: json.gate_code,
              gate_status: "IDLE",
              current_users: json.current_users,
              max_users: json.max_users,
              public_gate: json.public,
            },
          ]);
          // console.log(error ?? "No error");
          console.log(data);

          db_channel = supabase
            .channel(`gate:${sessionData.address}`)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "gates" },
              supabase_subscribe
            )
            .subscribe();

          ws.send('{ code: 200, message: "Address accepted" }');
        } else {
          ws.send('{ code: 403, message: "Address already taken" }');
          break;
        }
        break;
      case "dialRequest":
        if (json.dialed_address == sessionData.address) {
          ws.send('{"code": 403, "message":"Gate is busy"}');
          break;
        }

        var { data: data, error } = await supabase
          .from("gates")
          .select("*")
          .eq("gate_address", json.dialed_address)
          .eq("gate_code", json.dialed_code)
          .single();
        if (data == null) {
          ws.send('{"code":404, "message":"Gate not found"}');
          break;
        }

        if (data.gate_status != "IDLE") {
          ws.send('{"code": 403, "message":"Gate is busy"}');
          break;
        } else {
          var { data: d, error } = await supabase
            .from("gates")
            .update({ gate_status: "INCOMING" })
            .eq("gate_address", json.dialed_address)
            .eq("gate_code", json.dialed_code)
            .select();
          console.log(json.dialed_address);

          ws.send('{"code":200, "message":"Wormhole established"}');
        }
        break;
      case "keepAlive":
        break;
      default:
        ws.send('{"code":400, "message":"No request type given"}');
        break;
    }
  });

  ws.on("close", async (code, reason) => {
    console.log(
      `Connection Closed.\nCode: ${code.toString()}\nReason: ${reason}`
    );
    if (sessionData.address != "") {
      db_channel.unsubscribe();
      await supabase.from("gates").delete().eq("host_id", sessionData.host_id);
    }
  });
});
