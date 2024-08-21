 // Import npm Modules

import SteamUser from "steam-user";
import SteamCommunity from "steamcommunity";
import TradeOfferManager from "steam-tradeoffer-manager";
import path from "path";
import axios from "axios";

// Import Custom Modules
import tradeItem from "../modals/sentOffer.js";
import MarketplaceModel from "../modals/marketplaceModel.js";
import { TradeActivityLog } from "../function/activityLog.js";
import calculateFloat from "../utils/calculateFloat.js";
import getStickers from "../function/getStickers.js";
import getUnique from "../function/getUnique.js";
import steamMarketPrice from "../function/steamMarketPrice.js";
import steamPriceModel from "../modals/steamPriceModel.js";

/* The above code is written in JavaScript and it seems to be attempting to set the `__dirname`
variable to the resolved path of the current working directory. However, the code snippet is missing
the required import statement for the `path` module, which would typically be `const path =
require('path');` in Node.js environment. */
const __dirname = path.resolve();

class SteamBot {
	// initialize all variables in the constructor.
  constructor(logOnOptions) {
    this.client = new SteamUser();
    this.community = new SteamCommunity();
    this.isRunning = false;
    this.identitySecret = logOnOptions.botIdentitySecret;
    this.manager = new TradeOfferManager({
      steam: this.client,
      community: this.community,
      language: "en",
    });
    this.botName = logOnOptions.accountName;
    this.totalItemsOfBot = 0;
    this.botId = logOnOptions.botId;
    this.botSteamId = logOnOptions.steamId;
    this.community.on("sessionExpired", () => {
      this.client.logOn(logOnOptions);
    });
    this.login(logOnOptions);
  }

  login(logOnOptions) {
    this.client.logOn(logOnOptions);
    this.client.once("loggedOn", async () => {
      const key = process.env.STEAM_API_ACCESS_KEY; // Access key form the environment file
      const gameId = 730;
      const requestUrl = `https://api.steamapis.com/steam/inventory/${this.botSteamId}/${gameId}/2?api_key=${key}`;
      const inventory = await axios.get(requestUrl); //called API to fetch the Inventory
      const { total_inventory_count } = inventory.data || {
        total_inventory_count: 0,
      };
      if (total_inventory_count) {
        this.totalItemsOfBot = total_inventory_count;
      }
      this.isRunning = true;
    });
    this.client.on("error", (error) => {
      console.error("Steam client error:", error);
    });
    this.client.on("webSession", (sessionid, cookies) => {
      this.manager.setCookies(cookies);
      this.community.setCookies(cookies);
      this.community.stopConfirmationChecker();
    });

    this.manager.on("sentOfferChanged", async (offer) => {
      const { id, state, itemsToReceive, itemsToGive } = offer;
      if (state === 5 || state === 6 || state === 7 || state === 10) {
        if (itemsToReceive.length > 0 || itemsToGive.length > 0) {
          await tradeItem.updateMany(
            { offerId: id },
            { $set: { status: "Declined" } }
          ); // when declined trade offer
        }
      } else if (state === TradeOfferManager.ETradeOfferState.Accepted) {
        const TradeData = await tradeItem
          .findOne({
            offerId: id,
          })
          .lean();
        if (TradeData) {
          await tradeItem.updateMany(
            {
              offerId: id,
            },
            {
              status: "Confirm",
              accepted: true,
            }
          );
          offer.getExchangeDetails(
            true,
            async (err, status, tradeInitTime, receivedItems, sentItems) => {
              if (err) {
                console.log(`Error getting exchange details: ${err.message}`);
                return;
              }
              if (receivedItems?.length > 0 && sentItems?.length <= 0) {
                for await (const el of receivedItems) {
                  try {
                    const priceArray = await steamPriceModel.find({
                      market_hash_name: el?.market_hash_name,
                    });
                    let steamPrice = 0;
                    if (priceArray && priceArray.length > 0) {
                      steamPrice = priceArray[0].prices.unstable
                        ? priceArray[0].prices.max
                        : priceArray[0].prices.avg;
                    }
                    const offerReceiveItems =
                      TradeData?.offer?.itemsToReceive?.find(
                        (sk) => sk?.assetid === el.assetid
                      );
                   
                    if (TradeData?.tradeType === "Deposit") {
                      const stickers = getStickers(el.descriptions);
                      const unique = await getUnique(el);
                      const saveData = {
                        userId: TradeData?.userId,
                        ownerId: TradeData?.userId,
                        assetid: el.new_assetid,
                        classid: el.classid,
                        name: el.name,
                        market_hash_name: el.market_hash_name,
                        sold: false,
                        listing: true,
                        price: Number(steamPrice) || 0,
                        sellPrice: Number(offerReceiveItems?.sellPrice) || 6666,
                        commission: Number(offerReceiveItems?.commission) || 1,
                        icon_url: el.icon_url,
                        type: el.type,
                        tradable: 0,
                        bargain: false,
                        tags: el.tags,
                        description: el.descriptions,
                        floatValue: calculateFloat(
                          el?.tags[el.tags.length - 1]
                        ),
                        link: el?.actions,
                        botName: this.botName,
                        botId: this.botId,
                        stickers,
                        uniquePoints: unique,
                      };
                      await MarketplaceModel.create(saveData);
                      await TradeActivityLog({
                        type: "sellOnMarketplace",
                        name: el?.name,
                        userId: TradeData?.userId,
                        assetid: el?.assetid,
                        icon_url: el?.icon_url,
                        sellPrice: Number(offerReceiveItems?.sellPrice) || 0,
                        commission: Number(offerReceiveItems?.commission) || 0,
                        market_hash_name: el?.market_hash_name,
                        price: Number(steamPrice) || 0,
                      });
                    } else if (TradeData?.tradeType === "sendGoFestInventory") {
                      const stickers = getStickers(el.descriptions);
                      const unique = await getUnique(el);
                      const saveData = {
                        userId: TradeData?.userId,
                        ownerId: TradeData?.userId,
                        assetid: el.new_assetid,
                        classid: el.classid,
                        name: el.name,
                        market_hash_name: el.market_hash_name,
                        sold: false,
                        listing: false,
                        price: Number(steamPrice) || 0,
                        sellPrice:
                          Number(offerReceiveItems?.sellPrice) ||
                          Number(TradeData?.sellPrice) ||
                          0,
                        commission:
                          Number(offerReceiveItems?.commission) ||
                          Number(TradeData?.commission) ||
                          0,
                        icon_url: el.icon_url,
                        type: el.type,
                        tradable: 0,
                        bargain: false,
                        tags: el.tags,
                        description: el.descriptions,
                        floatValue: calculateFloat(
                          el?.tags[el.tags.length - 1]
                        ),
                        link: el?.actions,
                        botName: this.botName,
                        botId: this.botId,
                        stickers,
                        uniquePoints: unique,
                      };
                      await MarketplaceModel.create(saveData);
                      await TradeActivityLog({
                        type: "SteamToGoFestInventory",
                        name: el?.name,
                        userId: TradeData?.userId,
                        assetid: el?.assetid,
                        icon_url: el?.icon_url,
                        sellPrice: Number(offerReceiveItems?.sellPrice) || 0,
                        commission: Number(offerReceiveItems?.commission) || 0,
                        market_hash_name: el?.market_hash_name,
                        price: Number(steamPrice) || 0,
                      });
                    }
                  } catch (error) {
                    console.log("Error on item receive-->", error);
                  }
                }
              } else if (sentItems?.length > 0 && receivedItems?.length <= 0) {
                for await (const el of sentItems) {
                  const steamPrice = await steamMarketPrice(
                    el?.market_hash_name
                  );
                  if (TradeData?.tradeType === "Withdraw") {
                    await MarketplaceModel.updateOne(
                      { userId: TradeData?.userId, assetid: el?.assetid },
                      { isDeleted: true }
                    );
                    await TradeActivityLog({
                      type: "GoFestToSteamInventory",
                      name: el?.name,
                      userId: TradeData?.userId,
                      assetid: el?.assetid,
                      icon_url: el?.icon_url,
                      sellPrice: Number(TradeData?.sellPrice) || 0,
                      commission: Number(TradeData?.commission) || 0,
                      market_hash_name: el?.market_hash_name,
                      price: Number(steamPrice?.lowest_price) || 0,
                    });
                  }
                }
              }
            }
          );
        }
      }
    });

    // Steam is down or the API is having issues
    this.manager.on("pollFailure", () => {
      this.isRunning = false;
    });

    // When we receive new trade offer data, save it so we can use it after a crash/quit
    this.manager.on("pollData", () => {
      this.isRunning = true;
    });
  }

  // send trade offer to bot
  sendOfferToBot(randomHash, tradeurl, items, callback) {
    const offer = this.manager.createOffer(tradeurl);
    offer.addTheirItems(items);
    offer.setMessage(
      `sell your item on the GoFest platform  Match code ${randomHash}`
    );
    offer.send((err, status) => {
      callback(err, status === "sent" || status === "pending", status, offer);
    });
  }

  // send trade offer from the bot
  async sendOfferFromBot(randomHash, tradeurl, items, callback) {
    return new Promise((res) => {
      try {
        const offer = this.manager.createOffer(tradeurl);
        offer.addMyItems(items);
        offer.setMessage(
          `Your Withdraw Item from GoFest, Match code: ${randomHash}`
        );
        offer.send(async (errs, status) => {
          try {
            if (status === "pending") {
              this.community.acceptConfirmationForObject(
                this.identitySecret,
                offer.id,
                (error) => {
                  if (error) {
                    console.log(
                      `error is here in bot confirmation ${this.botName}`,
                      error
                    );
                  } else {
                    console.log(`Offer confirmed ${this.botName}`);
                  }
                }
              );
            }
            await callback(
              errs,
              status === "sent" || status === "pending",
              status,
              offer,
              this.botId
            );
            res();
          } catch (error) {
            console.log(
              `sendOfferFromBot CB ERROR FROM : ${this.botName}`,
              error
            );
            callback("Failed to send offer", false, "err", { state: 0 });
            res();
          }
        });
      } catch (error) {
        console.log(`sendOfferFromBot ERROR FROM : ${this.botName}`, error);
        callback("Failed to send offer", false, "err", { state: 0 });
        res();
      }
    });
  }
}
export default SteamBot;
