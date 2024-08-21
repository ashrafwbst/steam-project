 // Import npm Modules
import SteamTotp from "steam-totp";

// Import Custom Modules
import BotDetailModel from "../modals/botModel.js";
import Bot from "./newBot.js";

class BotManager {
  constructor() {
    this.bots = [];
    this.botWithItems = [];
  }

/**
 * The function `loadBotsForLogin` asynchronously loads active bot configurations and creates bot
 * instances with a 5-second delay between each creation.
 */
  async loadBotsForLogin() {
    try {
      const botConfigs = await BotDetailModel.find({ isActive: true });
      for await (const botConfig of botConfigs) {
        await new Promise((resolve) => {
          setTimeout(async () => {
            const botInstance = new Bot({
              accountName: botConfig.username,
              password: botConfig.password,
              twoFactorCode: SteamTotp.generateAuthCode(botConfig.shareSecret),
              botId: botConfig._id,
              steamId: botConfig.steamid,
              botIdentitySecret: botConfig.identity_secret,
            });
            this.bots.push(botInstance);
            resolve();
          }, 5000); // 5 seconds delay in milliseconds
        });
      }
    } catch (error) {
      console.error("Error loading bot configurations:", error);
    }
  }

/**
 * This asynchronous function recursively finds and returns an available bot for an offer based on
 * certain conditions.
 * @returns The `getAvailableBotForOffer` method returns an available bot that is currently running and
 * has less than 1000 total items, or it recursively calls itself to find another available bot. If an
 * error occurs during the process, it logs the error and returns `null`.
 */
  async getAvailableBotForOffer() {
    try {
      const availableBot = this.bots.find(
        (bot) => bot.isRunning && bot.totalItemsOfBot < 1000
      );
      if (availableBot) {
        return availableBot;
      }
      return await this.getAvailableBotForOffer();
    } catch (err) {
      console.log("Error:", err);
      return null;
    }
  }

/**
 * The function `getAvailableBotForSendOfferFromBot` asynchronously retrieves an available bot for
 * sending an offer based on the provided bot name.
 * @param botName - The `botName` parameter is a string that represents the name of the bot for which
 * you want to find an available bot to send an offer from.
 * @returns The function `getAvailableBotForSendOfferFromBot` returns the `availableBot` if it meets
 * the conditions specified in the `find` method, otherwise it returns `null`.
 */
  async getAvailableBotForSendOfferFromBot(botName) {
    const availableBot = this.bots.find(
      (bot) => bot.isRunning && bot.botName === botName
    );
    return availableBot || null;
  }

/**
 * The function `sendOfferToBotUsingAvailableBot` sends an offer to an available bot using specified
 * parameters.
 * @param randomHash - A unique identifier for the offer being sent to the bot.
 * @param tradeurl - The `tradeurl` parameter in the `sendOfferToBotUsingAvailableBot` function is
 * typically a URL that represents the trade offer URL where the items will be traded between the user
 * and the bot. This URL is used to facilitate the trade process and ensure that the items are
 * exchanged correctly.
 * @param items - The `items` parameter in the `sendOfferToBotUsingAvailableBot` function likely refers
 * to the items that are being sent in the trade offer to the bot. These items could be in the form of
 * an array, object, or any other data structure depending on how the function is designed to
 * @param callback - The `callback` parameter in the `sendOfferToBotUsingAvailableBot` function is a
 * function that will be called after attempting to send an offer to a bot. It is used to handle the
 * response or outcome of the offer sending process. The callback function typically takes parameters
 * such as an error message
 */
  async sendOfferToBotUsingAvailableBot(randomHash, tradeurl, items, callback) {
    const availableBot = await this.getAvailableBotForOffer();
    if (availableBot && availableBot.isRunning) {
      await availableBot.sendOfferToBot(
        randomHash,
        tradeurl,
        items,
        callback,
        availableBot?.botId
      );
    } else {
      callback("Bot not available to send offer", false, "err", { state: 0 });
    }
  }

  /* The `async sendOfferFromBotUsingAvailableBot` function is iterating over an array of items and
  attempting to send an offer from a bot for each item. Here's a breakdown of what the function is
  doing: */
  async sendOfferFromBotUsingAvailableBot(
    randomHash,
    tradeurl,
    items,
    callback
  ) {
    if (items.length > 0) {
      for await (const item of items) {
        const availableBot = await this.getAvailableBotForSendOfferFromBot(
          item.botName
        );
        if (availableBot && availableBot?.isRunning) {
          await availableBot.sendOfferFromBot(
            randomHash,
            tradeurl,
            item?.items,
            callback,
            availableBot?.botId
          );
        } else {
          callback(
            "Bot not available to send offer for this item",
            false,
            "err",
            { state: 0 }
          );
        }
      }
    }
  }
}
export default BotManager;
