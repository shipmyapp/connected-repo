import * as Comlink from "comlink";
import { CDNManager } from "./cdn.manager";

// Expose the CDNManager class to the main thread
Comlink.expose(CDNManager);
