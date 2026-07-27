# Market — Terminal Trading & Price History

Status: **Planned**. v1 scope: a single `marketManager` that watches a
small set of resources (energy, base minerals, the player's own
mineral), maintains a `Memory.market.history` price log, and creates
sell/buy orders when prices cross configurable thresholds.

## Goal

RCL 6 with a terminal opens a market economy. v1 ships:

1. **Price history** — every N ticks, sample `Game.market.getAllOrders`
   for the resources we care about and store the median in
   `Memory.market.history`.
2. **Auto-sell surplus** — sell the player's mineral when
   `history.median > SELL_PRICE_FLOOR` and `terminal.store[mineral] >
   SELL_AMOUNT_MIN`.
3. **Auto-buy underpriced** — buy energy/base minerals when
   `history.median < BUY_PRICE_CEILING` and `terminal.store[energy] <
   BUY_AMOUNT_TARGET`.

v1 does **not** implement inter-room arbitrage, deal handling, or
long-haul trade routes. Those are v2.

## Prerequisites / gates

- `controller.level >= 6` (terminal required for orders).
- `STRUCTURE_TERMINAL` exists and is owned.
- `Memory.market.history` initialized.
- Feature flag `Memory.flags.market === true` (off by default).

## A. Price history

`src/utils/priceHistory.js` — small module with two functions:

- `samplePrices()` — fetches `Game.market.getAllOrders({resourceType})`
  for each tracked resource, computes the median sell price (sorted
  array, pick the middle), and appends to `Memory.market.history`.
- `getTrend(resource)` — returns the slope of the last N samples; used
  to gate "buy" actions (don't buy if the price is falling).

Sample interval: `MARKET_HISTORY_INTERVAL` (default 100 ticks).
Per-resource max samples: 50 (drop oldest).

## B. New: `src/managers/marketManager.js`

Per-tick (bucket > 5000). For each owned room with a terminal:

1. **Sample prices** every `MARKET_HISTORY_INTERVAL` ticks.
2. **Compute intent** — for each resource:
   - Sell if `price >= SELL_FLOOR` AND `terminal.store >= SELL_MIN`
     AND no active sell order OR active sell order below current
     price.
   - Buy if `price <= BUY_CEILING` AND `terminal.store < BUY_TARGET`
     AND trend is flat/rising AND no active buy order.
3. **Place an order**:
   - Sell: `Game.market.createOrder({type: ORDER_SELL, resourceType,
     price, totalAmount, roomName})`. Cancel and replace when the
     median moves more than `PRICE_REPLACE_THRESHOLD` (default 0.05).
   - Buy: `Game.market.createOrder({type: ORDER_BUY, ...})`. Same
     cancel/replace rule.
4. **Deal with incoming trades** — `Game.market.incomingTransactions`
   and `outgoingTransactions` are read each tick and counted into
   `Memory.market.stat`. No automated response; just a log.

## C. Configuration

| Constant | Default | Description |
|---|---|---|
| `MARKET_HISTORY_INTERVAL` | 100 | Ticks between price samples |
| `MARKET_SELL_FLOOR_ENERGY` | 0.05 | Energy sell floor (credits/kE) |
| `MARKET_BUY_CEILING_ENERGY` | 0.02 | Energy buy ceiling |
| `MARKET_SELL_FLOOR_MINERAL` | varies | Per-mineral sell floor (H, O, U, L, K, Z, X) |
| `MARKET_BUY_CEILING_MINERAL` | varies | Per-mineral buy ceiling |
| `MARKET_SELL_MIN_AMOUNT` | 1000 | Minimum terminal balance to sell |
| `MARKET_BUY_TARGET_AMOUNT` | 50000 | Refill target (energy) |
| `MARKET_PRICE_REPLACE_THRESHOLD` | 0.05 | Replace order when price moves > 5% |
| `MARKET_MAX_ORDERS_PER_ROOM` | 5 | Cap to avoid spam |
| `MARKET_TRACKED_RESOURCES` | [energy, H, O, U, L, K, Z, X] | Resources sampled |

## D. Files to add / change

| Path | Type |
|---|---|
| `src/managers/marketManager.js` | new |
| `src/utils/priceHistory.js` | new |
| `src/config/constants.js` | add the constants above |
| `src/main.js` | call `marketManager.tick()` (bucket > 5000) |
| `src/managers/roomManager.js` | add `terminal` to the snapshot (already partially present via `room.storage` — needs a separate field) |
| `src/utils/memorySchema.js` | accessors for `Memory.market`, `Memory.market.history`, `Memory.market.stat` |
| `tests/mocks/screeps.js` | add `Game.market.getAllOrders`, `Game.market.createOrder`, `Game.market.cancelOrder`, `Game.market.incomingTransactions`, `Game.market.outgoingTransactions`, `ORDER_SELL`, `ORDER_BUY` |

## E. Memory layout

```js
Memory.market = {
  history: {
    [resourceType]: [{ tick, price, sellCount, buyCount }],  // max 50 samples
  },
  orders: {
    [roomName]: [{ id, type, resourceType, price, amount, createdTick }],
  },
  stat: {
    sold: 0,           // credits earned
    bought: 0,         // credits spent
    ordersPlaced: 0,
    ordersCancelled: 0,
    dealsCompleted: 0,
  },
  lastSampleTick: 0,
};
```

## F. Migration

- Bump `Memory.migrated` to **7** in `globals.js`.
- Initialize `Memory.market = { history: {}, orders: {}, stat: {...}, lastSampleTick: 0 }`.
- Set `Memory.flags.market = false` if not already.

## G. Failure modes

| Symptom | Likely cause | Action |
|---|---|---|
| Orders fail to place | Terminal cooldown (10 ticks between orders) | `marketManager` rate-limits; log on failure |
| Buy order filled but terminal is full | Incoming transfer while target not yet reached | Set `BUY_TARGET_AMOUNT` below terminal capacity |
| Sell order too cheap | Outdated history | Reduce `MARKET_HISTORY_INTERVAL` to 50 |
| Many small orders | Repeated price re-ordering | Increase `PRICE_REPLACE_THRESHOLD` to 0.1 |
| All orders cancelled by the engine | Not enough credits | Add a credit buffer check before placing; skip if `Game.market.credits < MIN_CREDIT_BALANCE` |

## H. Open questions (v2)

- **Multi-room arbitrage.** v1 ignores room-to-room price differences.
  v2 would track per-room prices and dispatch a hauler to arbitrage.
- **Resource deals.** `Game.market.deal(orderId, amount)` is exposed;
  v1 just creates orders and lets the engine match. v2 could
  selectively fill incoming orders (e.g. buy 1000 H at < ceiling).
- **Compound orders.** Selling a `XGHO2` directly is more profitable
  than selling G + H + O. v1 doesn't compound; v2 would prioritize
  compound inventory over base minerals.
- **Subscription model.** v1 samples on a fixed interval. v2 could
  subscribe to per-resource price-change webhooks (via the user
  script's `console` of `Game.market` notifications).
