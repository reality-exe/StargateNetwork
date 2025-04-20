import "dotenv/config";
import PocketBase from "pocketbase/cjs";
import { Stargate } from "../types/Stargate";
const { WS_PORT, PB_EMAIL, PB_ENDPOINT, PB_PASSWORD } = process.env;

const pb = new PocketBase(PB_ENDPOINT);

async function auth() {
  await pb.admins
    .authWithPassword(PB_EMAIL as string, PB_PASSWORD as string)
    .then((res) => {
      if (res) {
        pb.autoCancellation(false);
        console.log(
          `${new Date()} | Logged into PocketBase instance. Email: ${
            res.admin.email
          }`
        );
      }
    });
}
auth();
export default pb;

export async function findGate(gate_address: string) {
  try {
    let response = await pb
      .collection("stargates")
      .getFirstListItem<Stargate>(`gate_address="${gate_address}"`);
    return response;
  } catch (error) {
    return null;
  }
}

export async function createGate(data: Stargate) {
  let response = await pb.collection("stargate").create<Stargate>(data);
  return response;
}
