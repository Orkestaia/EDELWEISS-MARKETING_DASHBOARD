import "server-only";
import { stockDatabase } from "../stock";
import { SupplierService } from "./service";

let instance: SupplierService | undefined;
let ready: Promise<void> | undefined;
export async function suppliers() {
  instance ??= new SupplierService(await stockDatabase());
  ready ??= instance.migrate().catch(error => { ready = undefined; throw error; });
  await ready;
  return instance;
}
