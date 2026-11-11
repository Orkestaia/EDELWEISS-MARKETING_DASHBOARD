import "server-only";
import { stock, stockDatabase } from "./index";
import { PlanningService } from "./planning-service";
import { fetchStockPreorders } from "./preorders";

let instance:PlanningService|undefined, ready:Promise<void>|undefined;
export async function planning() {
 await stock();
 instance ??= new PlanningService(await stockDatabase(),(date,products,catalog,feed)=>fetchStockPreorders(date,products,catalog,fetch,feed));
 ready ??= instance.migrate().catch(error=>{ready=undefined;throw error;});await ready;
 return instance;
}
