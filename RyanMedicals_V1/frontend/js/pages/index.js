// Page registry. To add a page:
//   1. create js/pages/<name>.js exporting `title`, `render()` and optionally `bind(ctx)`
//   2. register it below with the same key used in data-page / data-go attributes
import * as overview from "./overview.js";
import * as inventory from "./inventory.js";
import * as medicines from "./medicines.js";
import * as batches from "./batches.js";
import * as stockIn from "./stockIn.js";
import * as stockOut from "./stockOut.js";
import * as movements from "./movements.js";
import * as suppliers from "./suppliers.js";
import * as reorder from "./reorder.js";

export const pages = {
  overview,
  inventory,
  medicines,
  batches,
  "stock-in": stockIn,
  "stock-out": stockOut,
  movements,
  suppliers,
  reorder,
};
