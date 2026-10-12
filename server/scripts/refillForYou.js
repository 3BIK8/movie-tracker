import "dotenv/config";
import { refillForYouFeed } from "../services/forYou/feedRefillService.js";

const userId = Number(process.env.REFILL_USER_ID || 1);
console.log(JSON.stringify(await refillForYouFeed(userId), null, 2));
