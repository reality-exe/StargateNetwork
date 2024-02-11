require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");
const { WebSocketServer } = require("ws");
const { supabase_url, supabase_key } = process.env;

const wss = new WebSocketServer({ port: 9066 });

const supabase = createClient(supabase_url, supabase_key);

var db_channel = supabase.channel("events");

async function flushDatabase() {
  await supabase.from("gates").delete().neq("gate_status", "PLACEHOLDER");
}
flushDatabase();

wss.on("connection", async (ws) => {
  console.log("New connection");
  var sessionData = {
    address: "",
    code: "",
    host_id: "",
    incoming: false,
  };
  var dialed_session = {
    address: "",
    code: "",
    host_id: "",
  };

  function supabase_subscribe(payload) {
    console.log(payload);
    let new_data = payload.new;

    if (new_data.gate_address == sessionData.address) {
      switch (new_data.gate_status) {
        case "IDLE":
          if (sessionData.incoming) {
            sessionData.incoming = false;
            ws.send("Impulse:CloseWormhole");
            break;
          }
          break;
        case "OUTGOING":
          break;
        case "INCOMING7":
          sessionData.incoming = true;
          ws.send("Impulse:OpenIncoming:7");
          break;
        case "INCOMING8":
          sessionData.incoming = true;
          ws.send("Impulse:OpenIncoming:8");
          break;
        case "INCOMING9":
          sessionData.incoming = true;
          ws.send("Impulse:OpenIncoming:9");
          break;

        default:
          break;
      }
    }
  }

  ws.on("message", async (msg) => {
    let json = JSON.parse(msg.toString());
    console.log(json);
    switch (json.type) {
      case "validateAddress":
        // Return 400 if address' length is too short
        if (json.gate_address.length < 6) {
          ws.send("CSValidCheck:400");
          break;
        }
        var gate_address_full = json.gate_address
        var gate_address = gate_address_full.slice(0,6)
        if (json.gate_address == sessionData.address) {
          ws.send("CSDialCheck:404");
          break;
        }

        switch (gate_address_full.length) {
          case 6:
            var gate_code = sessionData.code;
            break;
          case 7:
            var gate_code = gate_address_full.slice(6) + "@";
            break;
          case 8:
            var gate_code = gate_address_full.slice(6);
            break;
        }

        var { data: data, error } = await supabase
          .from("gates")
          .select("*")
          .eq("gate_address", gate_address)
          .eq("gate_code", gate_code)
          .single();

        if (data == null) {
          // Return 404 if there is no gate with that address
          ws.send("CSValidCheck:404");
          break;
        } else if (data.gate_status == "IDLE") {
          ws.send("CSValidCheck:200");
          break;
        } // Return 403 if gate has an active wormhole
        else if (data.gate_status == "OPEN") {
          ws.send("CSValidCheck:403");
          break;
        }

        break;
      case "requestAddress":
        // console.log("Request address");
        // console.log(json);
        if (json.gate_address.length < 6) {
          ws.send('{ code: 400, message: "Address too short" }');
          break;
        }
        var { data: data, error } = await supabase
          .from("gates")
          .select("*")
          .eq("gate_address", json.gate_address)
          .single();
        // console.log(error ?? "No error");

        if (data == null) {
          sessionData.address = json.gate_address;
          sessionData.code = json.gate_code;
          sessionData.host_id = json.host_id;
          var { data: d, error } = await supabase
            .from("gates")
            .select("*")
            .eq("session_id", json.session_id)
            .single();
          if (d == !null) {
            ws.send("403");
            break;
          }
          var { data: data, error } = await supabase.from("gates").insert([
            {
              host_id: json.host_id,
              is_headless: json.is_headless,
              session_id: json.session_id,
              gate_address: json.gate_address,
              gate_status: "IDLE",
              gate_code: json.gate_code,
              current_users: json.current_users,
              max_users: json.max_users,
              public_gate: json.public,
              name: json.gate_name,
            },
          ]);
          // // console.log(error ?? "No error");
          // console.log(data);

          db_channel = supabase
            .channel(`gate:${sessionData.address}`)
            .on(
              "postgres_changes",
              { event: "*", schema: "public", table: "gates" },
              supabase_subscribe
            )
            .subscribe();

          ws.send('{ code: 200, message: "Address accepted" }');
        } else if (data.session_id == json.session_id) {
          ws.send('{ code: 200, message: "Address accepted" }');
          break;
        } else {
          ws.send("403");
        }
        break;
      case "dialRequest":
        var gate_address_full = json.gate_address
        var gate_address = gate_address_full.slice(0,6)
        if (json.gate_address == sessionData.address) {
          ws.send("CSDialCheck:404");
          break;
        }

        switch (gate_address_full.length) {
          case 6:
            var gate_code = sessionData.code;
            break;
          case 7:
            var gate_code = gate_address_full.slice(6) + "@";
            break;
          case 8:
            var gate_code = gate_address_full.slice(6);
            break;
        }
        console.log(gate_code)

        var { data: data, error } = await supabase
          .from("gates")
          .select("*")
          .eq("gate_address", gate_address)
          .eq("gate_code", gate_code)
          .single();
        if (data == null) {
          ws.send("CSDialCheck:404");
          break;
        }

        if (data.gate_status != "IDLE") {
          ws.send("CSDialCheck:403");
          break;
        } else {
		  var { data: d, error } = await supabase
			.from("gates")
			.update({ gate_status: "INCOMING" + toString(json.gate_address.length + 1) })
			.eq("gate_address", gate_address)
			.eq("gate_code", gate_code)
			.select("*")
			.single();
          dialed_session.address = d.gate_address;
          dialed_session.code = d.gate_code;
          dialed_session.host_id = d.host_id;

          ws.send(`${JSON.stringify(d)}`);
          ws.send("CSDialCheck:200");
          ws.send(`CSDialedSessionURL:${data.session_id}`);
        }
        break;
      case "keepAlive":
        break;
      case "closeWormhole":
        var { data: _this, error: _errorthis } = await supabase
          .from("gates")
          .update({ gate_status: "IDLE" })
          .eq("gate_address", sessionData.address)
          .eq("gate_code", sessionData.code)
          .select();
        // console.log(_errorthis ?? "No error");

        var { data: _other, error: _errorother } = await supabase
          .from("gates")
          .update({ gate_status: "IDLE" })
          .eq("gate_address", dialed_session.address)
          .eq("gate_code", dialed_session.code)
          .select();
        // console.log(_errorother ?? "No error");

        dialed_session.address = "";
        dialed_session.code = "";
        dialed_session.host_id = "";

        // console.log(JSON.stringify(dialed_session));
        break;
      case "updateData":
        var { data: data, error } = await supabase
          .from("gates")
          .update({
            gate_status: json.gate_status,
            current_users: json.current_users,
            max_users: json.max_users,
          })
          .eq("gate_address", sessionData.address)
          .select();
        // console.log(error ?? "e");
        break;
      case "test":
        // console.log("Recieved test");
        ws.send('{"code":200, "message":"Test"}');
        break;
      default:
        ws.send('{"code":400, "message":"No request type given"}');
        break;
    }
  });

  ws.on("close", async (code, reason) => {
    // console.log(
    // `Connection Closed.\nCode: ${code.toString()}\nReason: ${reason}`
    // );
    if (sessionData.address != "") {
      db_channel.unsubscribe();

      if (dialed_session.address != "") {
        var { data: data, error } = await supabase
          .from("gates")
          .update({ gate_status: "IDLE" })
          .eq("gate_address", dialed_session.address)
          .eq("gate_code", dialed_session.code)
          .single();
      }
      await supabase
        .from("gates")
        .delete()
        .eq("gate_address", sessionData.address);
    }
  });
});
