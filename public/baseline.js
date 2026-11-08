(function (global) {
  const THEMES = {
    returns_as_verdict: {
      label: "Early statement read as a verdict",
      lapse: "voluntary",
      kpiLeaf: "Paused / cancelled after seeing short-horizon P&L or XIRR",
      productOutcome: "Month-3/6 survival among first-SIP cohort",
      why12m: "Turns a live mandate into a pause without a restart date. Recovery requires a new decision.",
      keywords: [
        "loss", "negative", "xirr", "red", "underperform", "not working", "wrong fund",
        "should i continue", "switch", "pause till", "market", "profit", "returns",
        "fd", "statement", "portfolio", "midcap", "small cap", "gold", "stable",
        "3 months", "7 months", "no profit"
      ]
    },
    cash_need_unclear_recovery: {
      label: "Cash-need pause with no restart path",
      lapse: "voluntary",
      kpiLeaf: "Paused / reduced then stopped",
      productOutcome: "% paused SIPs resumed; time to recover",
      why12m: "A legitimate skip becomes a cancelled SIP because restart feels like starting over.",
      keywords: [
        "personal reasons", "expenses", "salary", "pause", "skip", "couple of months",
        "resume", "restart", "reduced", "1000", "medical", "tight", "cancel and start"
      ]
    },
    payment_fail_penalty_fear: {
      label: "Failed debit + unclear bank penalty",
      lapse: "involuntary",
      kpiLeaf: "Payment failed / mandate expired / bank limit",
      productOutcome: "% failed payments fixed in 7 days",
      why12m: "A failed debit can interrupt the payment cycle; uncertainty about bank charges may lead to deliberate cancellation.",
      keywords: [
        "insufficient", "balance", "penalty", "gst", "autopay", "mandate", "failed",
        "processing", "pay now", "bank", "debit", "due", "30th"
      ]
    },
    three_skip_trap: {
      label: "Three consecutive skips auto-cancel",
      lapse: "silent",
      kpiLeaf: "Missed cycles with no action → SIP cancelled",
      productOutcome: "Silent lapse rate; recovery after auto-cancel",
      why12m: "Silent disengagement is converted into a hard stop. Restart is a new SIP setup.",
      keywords: [
        "three consecutive", "3 months", "automatically cancelled", "auto cancel",
        "skip three", "cancelled and you have to make new", "unpaid"
      ]
    },
    silent_disengage: {
      label: "Stopped checking, mandate maybe still running",
      lapse: "silent",
      kpiLeaf: "Missed cycles with no action",
      productOutcome: "App opens after starting; month-3 survival",
      why12m: "Low app activity is a risk signal, not evidence of a missed payment. Confirm payment records before labelling a lapse.",
      keywords: [
        "stopped opening", "don't open", "stressed", "not sure if", "went through",
        "forgot", "don't remember"
      ]
    },
    in_app_control_confusion: {
      label: "Pause/cancel/skip controls not found or locked",
      lapse: "voluntary",
      kpiLeaf: "User-initiated pause/cancel, delayed or accidental",
      productOutcome: "Time to complete skip; accidental cancel rate",
      why12m: "Users cancel because skip is hidden, or miss because cancel is locked during processing.",
      keywords: [
        "cannot find", "greyed", "grayed", "how do i", "skip installment", "locked",
        "cannot be undone", "processing", "chatbot"
      ]
    },
    peer_education_outside_app: {
      label: "Meaning-making happens on Reddit/YouTube",
      lapse: "never_lapsed",
      kpiLeaf: "Outside-app workaround (leading risk)",
      productOutcome: "Share of cohort who seek SIP meaning in-app vs outside",
      why12m: "The job ‘is my SIP still a good decision?’ is fulfilled off-platform, often after the pause intent exists.",
      keywords: [
        "too short", "averaging down", "loss aversion", "horizon", "10 years", "yoyo"
      ]
    },
    fund_pick_request: {
      label: "Fund/stock pick request (out of scope)",
      lapse: "never_lapsed",
      kpiLeaf: "Not a continuation driver we may solve with picks",
      productOutcome: "n/a — brief forbids fund recommendations",
      why12m: "Engine must refuse. Picks do not explain 12-month continuation.",
      keywords: ["which sip", "recommend", "best fund", "start with", "double money"]
    },
    fomo_or_urgency: {
      label: "Fear / FOMO / urgency prompt",
      lapse: "never_lapsed",
      kpiLeaf: "Forbidden intervention",
      productOutcome: "Guardrail: no urgency prompts",
      why12m: "Brief forbids this. Engine must refuse.",
      keywords: ["miss out", "forever", "rally", "crash", "act now", "last chance"]
    },
    pii: {
      label: "Account / PAN / portfolio screenshot request",
      lapse: "never_lapsed",
      kpiLeaf: "Safety refuse",
      productOutcome: "Guardrail: no PII",
      why12m: "Brief forbids collecting account numbers, PAN, screenshots.",
      keywords: ["pan", "account number", "portfolio screenshot", "aadhaar"]
    },
    goal_decay: {
      label: "Original reason for SIP has faded",
      lapse: "voluntary",
      kpiLeaf: "Cancelled / redeemed without cash shock",
      productOutcome: "Month-12 active among cohort with no goal reminder",
      why12m: "Continuation was attached to a borrowed reason (friend, video). At month 11 the reason is gone.",
      keywords: ["forgot why", "redeem", "trip", "don't remember why"]
    }
  };

  function tokenize(text) {
    return (text || "").toLowerCase();
  }

  function scoreTheme(text, theme) {
    const t = tokenize(text);
    let hits = 0;
    const matched = [];
    for (const k of theme.keywords) {
      if (new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(t)) {
        hits += 1;
        matched.push(k);
      }
    }
    return { hits, matched, score: hits / Math.max(3, Math.sqrt(theme.keywords.length)) };
  }

  function safetyTheme(text) {
    const t = text || "";
    if (/\b(pan|aadhaar|account number|portfolio screenshot)\b|\b[A-Z]{5}[0-9]{4}[A-Z]\b|\b[0-9]{9,18}\b/i.test(t)) return "pii";
    if (/\b(recommend|best fund|best .*? fund|which sip|which (fund|stock)|double money|pick (a |the )?(fund|stock))\b/i.test(t)) return "fund_pick_request";
    if (/\b(miss out|act now|last chance|miss the rally|invest everything now)\b/i.test(t)) return "fomo_or_urgency";
    return null;
  }

  function classify(text) {
    const raw = (text || "").trim();
    if (raw.length < 8) {
      return {
        ok: false,
        action: "uncertain",
        reason: "Too little text to classify. Add what the person said and what they want to do.",
        themes: [],
        top: null
      };
    }

    const ranked = Object.entries(THEMES)
      .map(([id, theme]) => {
        const s = scoreTheme(raw, theme);
        return { id, ...theme, ...s };
      })
      .sort((a, b) => b.score - a.score);

    const safety = safetyTheme(raw);
    if (safety) {
      const index = ranked.findIndex(t => t.id === safety);
      ranked.unshift(ranked.splice(index, 1)[0]);
    }
    const top = ranked[0];
    const second = ranked[1];
    const margin = top.score - second.score;

    let action = "answer";
    if (safety) {
      action = "refuse";
    } else if (top.hits === 0) {
      action = "uncertain";
    } else if (margin < 0.08 && top.hits < 2) {
      action = "uncertain";
    }

    const lapse = top.lapse;
    return {
      ok: true,
      action,
      top,
      second,
      margin,
      themes: ranked.slice(0, 4),
      lapse
    };
  }

  function opportunityTable(corpus) {
    const counts = {};
    for (const row of corpus) {
      const key = row.gold_theme;
      counts[key] = counts[key] || { n: 0, lapse: {}, months: [] };
      counts[key].n += 1;
      counts[key].lapse[row.gold_lapse] = (counts[key].lapse[row.gold_lapse] || 0) + 1;
      if (row.months != null) counts[key].months.push(row.months);
    }

    const weights = {
      returns_as_verdict: { volume: 1, influence: 0.92, recoveryGap: 0.88, addressable: 0.9 },
      cash_need_unclear_recovery: { volume: 0.7, influence: 0.8, recoveryGap: 0.9, addressable: 0.85 },
      three_skip_trap: { volume: 0.55, influence: 0.85, recoveryGap: 0.95, addressable: 0.7 },
      payment_fail_penalty_fear: { volume: 0.65, influence: 0.7, recoveryGap: 0.6, addressable: 0.75 },
      silent_disengage: { volume: 0.4, influence: 0.8, recoveryGap: 0.9, addressable: 0.65 },
      in_app_control_confusion: { volume: 0.35, influence: 0.45, recoveryGap: 0.5, addressable: 0.8 },
      peer_education_outside_app: { volume: 0.5, influence: 0.3, recoveryGap: 0.2, addressable: 0.4 },
      goal_decay: { volume: 0.2, influence: 0.55, recoveryGap: 0.7, addressable: 0.5 },
      fund_pick_request: { volume: 0.15, influence: 0.05, recoveryGap: 0.1, addressable: 0 },
      fomo_or_urgency: { volume: 0.05, influence: 0, recoveryGap: 0, addressable: 0 },
      pii: { volume: 0.02, influence: 0, recoveryGap: 0, addressable: 0 }
    };

    return Object.keys(THEMES).map((id) => {
      const n = counts[id] ? counts[id].n : 0;
      const w = weights[id] || { volume: 0.2, influence: 0.2, recoveryGap: 0.2, addressable: 0.2 };
      const share = n / corpus.length;
      const opportunity = +(100 * share * w.influence * w.recoveryGap * w.addressable).toFixed(2);
      const months = counts[id] ? counts[id].months : [];
      const avgMonths = months.length ? (months.reduce((a, b) => a + b, 0) / months.length) : null;
      return {
        id,
        label: THEMES[id].label,
        lapse: THEMES[id].lapse,
        n,
        share,
        opportunity,
        influence: w.influence,
        recoveryGap: w.recoveryGap,
        addressable: w.addressable,
        avgMonths,
        why12m: THEMES[id].why12m,
        kpiLeaf: THEMES[id].kpiLeaf
      };
    }).sort((a, b) => b.opportunity - a.opportunity);
  }

  function evalGolden(set) {
    const rows = set.map((g) => {
      const r = classify(g.text);
      const themeOk = r.top && r.top.id === g.expect_theme;
      const actionOk = r.action === g.expect_action || (g.expect_action === "answer" && r.action === "uncertain" && r.top && r.top.id === g.expect_theme);
      // stricter: action must match for refuse; for answer, uncertain with right theme is partial
      let match = "fail";
      if (g.expect_action === "refuse") {
        match = r.action === "refuse" && themeOk ? "pass" : (r.action === "refuse" ? "partial" : "fail");
      } else {
        if (themeOk && r.action === "answer") match = "pass";
        else if (themeOk) match = "partial";
        else match = "fail";
      }
      return {
        id: g.id,
        text: g.text,
        expect_theme: g.expect_theme,
        got_theme: r.top ? r.top.id : null,
        expect_action: g.expect_action,
        got_action: r.action,
        match
      };
    });
    const pass = rows.filter((r) => r.match === "pass").length;
    const partial = rows.filter((r) => r.match === "partial").length;
    return {
      n: rows.length,
      pass,
      partial,
      fail: rows.length - pass - partial,
      agreement: pass / rows.length,
      relaxed: (pass + 0.5 * partial) / rows.length,
      rows
    };
  }

  const HELP = {
    skip: "https://groww.in/help/mutual-funds/order/can-i-pause-sip-for-next-month",
    three: "https://groww.in/help/mutual-funds/mf-sip/what-is-the-maximum-period-for-which-i-can-skip-my-sip-installments--63",
    fail: "https://groww.in/help/mutual-funds/order/why-did-my-sip-installment-fail--36",
    pay: "https://groww.in/help/mutual-funds/mf-sip/how-do-i-pay-for-my-sip-installment-if-the-autopay-debit-has-failed--40",
    cancel: "https://groww.in/help/mutual-funds/order/can-i-cancel-my-sip-as-per-my-wish"
  };

  function mvpReply(input) {
    const text = [
      input.situation,
      input.saw,
      input.intent,
      input.why,
      input.free
    ].filter(Boolean).join(". ");

    const months = Number(input.months || 0);
    const cls = classify(text + (months && months <= 8 ? " months sip statement" : ""));

    if (cls.action === "refuse" || (cls.top && ["fund_pick_request", "fomo_or_urgency", "pii"].includes(cls.top.id))) {
      return {
        gate: "refuse",
        title: "This is outside what SIP Sense Check can answer",
        body: refuseCopy(cls.top ? cls.top.id : "fund_pick_request"),
        confidence: null,
        theme: cls.top ? cls.top.id : "fund_pick_request",
        lapse: "n/a",
        sources: [],
        evalNote: "Refused: fund pick, FOMO/urgency, or personal identifiers."
      };
    }

    if (cls.action === "uncertain") {
      return {
        gate: "uncertain",
        title: "Not enough to interpret safely",
        body: "Tell me how many months this SIP has been running, what the screen showed (red / flat / failed payment / skipped), and whether the pressure is cash this month or the numbers. I will not guess a fund or tell you to buy more.",
        confidence: null,
        theme: cls.top ? cls.top.id : null,
        lapse: cls.lapse || null,
        sources: [],
        evalNote: "Fallback: asked for one clarifying fact instead of improvising."
      };
    }

    const themeId = disambiguateMvp(input, cls);
    const theme = THEMES[themeId];
    const copy = mvpCopy(themeId, months, input);
    return {
      gate: "pass",
      title: copy.title,
      body: copy.body,
      next: copy.next,
      confidence: null,
      theme: themeId,
      lapse: theme.lapse,
      kpiLeaf: theme.kpiLeaf,
      sources: copy.sources,
      evalNote: copy.evalNote
    };
  }

  function disambiguateMvp(input, cls) {
    const why = (input.why || "").toLowerCase();
    const saw = (input.saw || "").toLowerCase();
    const intent = (input.intent || "").toLowerCase();
    if (why.includes("cash") || why.includes("expense") || why.includes("salary")) return "cash_need_unclear_recovery";
    if (saw.includes("fail") || why.includes("payment") || why.includes("penalty")) return "payment_fail_penalty_fear";
    if (why.includes("red") || why.includes("return") || saw.includes("red") || saw.includes("flat") || saw.includes("negative")) {
      return "returns_as_verdict";
    }
    if (intent.includes("skip") && why.includes("confus")) return "in_app_control_confusion";
    if (cls.top) return cls.top.id;
    return "returns_as_verdict";
  }

  function refuseCopy(id) {
    if (id === "pii") {
      return "Do not paste account numbers, PAN, or portfolio screenshots. SIP Sense Check only uses the situation you describe. Official Groww support can see your account; this tool cannot and should not.";
    }
    if (id === "fomo_or_urgency") {
      return "I will not use fear, FOMO, or urgency. Those prompts are out of scope for this product. If you are deciding whether to skip this month, say whether the issue is cash, a failed payment, or the numbers on screen — I can unpack that without pushing you to act now.";
    }
    return "I cannot recommend funds, stocks, or a ‘best SIP’. This prototype explains payment mechanics and does not provide investment advice. I can help you interpret what an early SIP screen is (and is not), or point to Groww’s own help pages for skip, failed debit, and cancel.";
  }

  function mvpCopy(themeId, months, input) {
    if (themeId === "returns_as_verdict") {
      const horizon = months && months < 12 ? `${months} month${months === 1 ? "" : "s"}` : "the first year";
      return {
        title: "A red or flat SIP screen after " + horizon + " is not a verdict on the decision",
        body: "What you are looking at is the market price of units bought on a few dates, not a monthly interest credit. SIP is a payment habit attached to a market-linked product. Over a handful of instalments the rupee P&L and even XIRR swing with the last NAV — they do not yet say whether the SIP ‘works’. This short snapshot alone cannot establish suitability or predict future returns. The choice to continue, skip, or stop remains yours.",
        next: [
          "If the money is still affordable this month, skipping because the screen is red is a different decision from skipping because cash is tight.",
          "Stop vs redeem are different: cancelling future instalments leaves existing units in place.",
          "This tool will not tell you to buy more, switch funds, or ‘wait for the dip’."
        ],
        sources: [HELP.skip, HELP.cancel],
        confidence: months && months <= 8 ? 0.82 : 0.7,
        evalNote: "Answered interpretation; no fund names; no urgency."
      };
    }
    if (themeId === "cash_need_unclear_recovery") {
      return {
        title: "If this month’s cash is the issue, skip is a cash tool — not a market view",
        body: "Groww lets you skip an upcoming instalment from My SIPs → Edit SIP → Skip Installment. Skip one month at a time. Groww states that three consecutive skipped instalments automatically cancel the SIP, after which restart is a new setup — that is why ‘pause for a bit’ often becomes ‘I never came back’. Existing units are not sold when you skip or cancel.",
        next: [
          "If you skip, write a restart month now (even privately). Open-ended pause is how temporary becomes month-12 inactive.",
          "Check the next scheduled debit and any amount-change eligibility in Groww; this prototype cannot change a SIP.",
          "Official skip steps: Groww help on pausing the next month."
        ],
        sources: [HELP.skip, HELP.three, HELP.cancel],
        confidence: 0.86,
        evalNote: "Factual Groww skip/3-miss rules; no FOMO to continue paying."
      };
    }
    if (themeId === "payment_fail_penalty_fear") {
      return {
        title: "A failed SIP debit is usually a bank/mandate event, not a Groww ‘fine’",
        body: "Groww and the AMC typically do not levy a missed-SIP penalty. Your bank may charge for a failed mandate if AutoPay ran against insufficient balance — that charge varies by bank. Groww says cancellation is unavailable within 3 working days of an upcoming instalment. For a failed payment, locate the pending SIP on your dashboard and check its Pay option. Eligibility depends on the current app state; no fixed recovery window is promised here.",
        next: [
          "This is not legal or bank-fee advice; check your bank’s failed-SI / UPI AutoPay fee.",
          "Official pages: why instalment failed, how to pay a failed debit.",
          "I cannot see your account. Do not paste balances or account numbers here."
        ],
        sources: [HELP.fail, HELP.pay, HELP.three],
        confidence: 0.8,
        evalNote: "Separated Groww vs bank penalty; pointed to official help."
      };
    }
    if (themeId === "three_skip_trap" || themeId === "silent_disengage") {
      return {
        title: "Check payment status separately from app activity",
        body: "Groww’s help centre states that three consecutive skipped instalments automatically cancel the SIP. Not opening the app does not itself cancel a SIP. Check the actual payment and SIP status in Groww; this prototype cannot see either.",
        next: [
          "Check the affected instalment and next scheduled date before confirming a skip.",
          "If a debit already failed, use the official Pay Now / failed-debit help — not a third-party workaround."
        ],
        sources: [HELP.three, HELP.skip],
        confidence: 0.84,
        evalNote: "Cited 3-miss auto-cancel; no scare copy about missing the market."
      };
    }
    if (themeId === "in_app_control_confusion") {
      return {
        title: "Skip, cancel, and ‘processing’ are three different controls",
        body: "Skip targets a future instalment. Cancel stops future instalments but not units already bought, and cannot be undone — you would create a new SIP to resume. Groww says a skip request does not apply to an instalment due within two days. Cancellation is unavailable within three working days of an upcoming instalment. Check the confirmation screen for the affected date.",
        next: [
          "My SIPs → the SIP → Skip / Edit SIP → Skip Installment for a future month.",
          "Official cancel and skip articles are the source of truth if the UI is greyed out."
        ],
        sources: [HELP.skip, HELP.cancel],
        confidence: 0.83,
        evalNote: "UI mechanics only; not advice to cancel or stay."
      };
    }
    if (themeId === "goal_decay") {
      return {
        title: "The SIP is still running a job you may have forgotten",
        body: "A first SIP is often started because a friend or a video said to. By month 10–12 the original sentence is gone, so a trip or a red week can close it. That is a goal problem, not a fund problem. This tool will not invent a goal or tell you not to spend. It will only separate ‘I need the cash’ from ‘I cannot remember why this exists’.",
        next: [
          "If cash is needed, skip/cancel/redeem are different (future instalments vs selling units).",
          "If the reason faded, write one sentence for future-you before changing the mandate."
        ],
        sources: [HELP.cancel],
        confidence: 0.68,
        evalNote: "Low-confidence on motive; no urgency to continue."
      };
    }
    return {
      title: "I can only unpack continuation mechanics, not the investment itself",
      body: "Say whether this is (1) cash this month, (2) a failed debit, or (3) the portfolio number looking wrong. Those map to different leaves on the 12-month active-rate tree.",
      next: [],
      sources: [],
      confidence: 0.45,
      evalNote: "Generic fallback."
    };
  }

  global.SIPEngine = {
    THEMES,
    HELP,
    classify,
    opportunityTable,
    evalGolden,
    mvpReply
  };
})(window);
