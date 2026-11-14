// Starter questions on the welcome screen. Edit these to match what your team asks.
export const SUGGESTIONS = [
  { title: "Auction results", prompt: "How did the most recent day's auctions go? Chart the top bid as % of base price for each vehicle.", icon: "gavel" },
  { title: "Enquiries this month", prompt: "How many enquiries came in each day this month? Show it as a chart.", icon: "trending" },
  { title: "Money received", prompt: "How much money was received this month, split by party type? Show a chart.", icon: "wallet" },
  { title: "Enquiry pipeline", prompt: "How many open enquiries are in each status group right now?", icon: "funnel" },
  { title: "Evaluations", prompt: "How many evaluations were completed each week for the last 8 weeks?", icon: "clipboard" },
  { title: "Popular models", prompt: "Which make and model combinations got the most bids in the last 30 days?", icon: "car" },
] as const;
