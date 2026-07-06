import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readJsonl(filePath) {
  const text = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8").trim() : "";
  if (!text) return [];
  return text.split(/\n+/).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${filePath}:${index + 1} ${error.message}`);
    }
  });
}

function metadataKey(row) {
  return String(row.keyword || "").trim().toLowerCase();
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

const googleNativeRiskValues = new Set(["low", "medium", "high", "unknown"]);

const googleNativeHighRiskRules = [
  {
    name: "phone_or_area_code_lookup",
    pattern: /\b(?:\d{3}\s+(?:area|phone|telephone)\s+code|area code\s+\d{3}|what area code is|location of area code|ddd internacional|country code|dial(?:ing|ling) code)\b/i,
    reason: "phone, area, and country code lookups are usually single-value Google direct answers.",
  },
  {
    name: "simple_unit_conversion",
    pattern: /\b\d+(?:\.\d+)?\s*(?:k|km|kilometers?|miles?|lbs?|pounds?|kg|cm|mm|inches?|feet|ft|yards?|meters?|metres?|celsius|fahrenheit|f)\s+(?:in|to)\s+(?:k|km|kilometers?|miles?|lbs?|pounds?|kg|cm|mm|inches?|feet|ft|yards?|meters?|metres?|celsius|fahrenheit|f)\b/i,
    reason: "single unit conversions are covered by Google converter widgets.",
  },
  {
    name: "simple_date_or_holiday_lookup",
    pattern: /\b(?:when is|what day is|date of|eid|ramadan|father'?s day|mother'?s day|purim|passover|hanukkah|easter|thanksgiving|labor day|teacher appreciation day|mercury retrograde)\b.*\b(?:202[0-9]|date|when|day|start)\b/i,
    reason: "single holiday/date lookups are usually answered directly by Google or AI Overview.",
  },
  {
    name: "symbol_copy_lookup",
    pattern: /\b(?:section sign|tm sign|degree symbol|sign for degrees|downward arrow|and sign|male and female symbols|unicode|html entity|copy symbol|biohazard symbol|radiation symbol|copyright symbol|trademark symbol|registered symbol)\b/i,
    reason: "single symbol copy/input queries have weak differentiation beyond direct snippets.",
  },
  {
    name: "local_time_lookup",
    pattern: /\b(?:what time (?:is it|it is) in|current time in|local time in|time in)\b|\b(?:rep dom|dominican republic|dr)\s+time\b/i,
    reason: "single current-time lookups are direct Google time answers.",
  },
  {
    name: "simple_color_value_lookup",
    pattern: /\b(?:hex code|color code|colour name|color name|gold hex|gold color code|light pink|copper color|mahogany color|french blue)\b/i,
    reason: "single color value lookups are commonly satisfied by instant snippets or color widgets.",
  },
  {
    name: "simple_prayer_time_lookup",
    pattern: /\b(?:prayer time|isha time|fajr|asr|subuh)\b/i,
    reason: "single prayer-time lookups are direct local/time answers unless the product adds a broader planner.",
  },
  {
    name: "simple_fact_answer",
    pattern: /\b(?:density of air)\b/i,
    reason: "single factual answers are easy for Google snippets or AI Overview to satisfy.",
  },
];

const googleNativeMediumRiskRules = [
  {
    name: "generic_translation_tool",
    pattern: /\b(?:translator|translation|translate|spanish to english|english to [a-z]+|[a-z]+ to english)\b/i,
    reason: "generic translation intent has strong Google Translate and SERP widget competition.",
  },
  {
    name: "simple_map_or_airport_lookup",
    pattern: /\b(?:county map|airport code|terminal \d+|hawaii map|islands map|oklahoma map|scotland map)\b/i,
    reason: "simple maps, airport codes, and terminal facts are often covered by Google results or Maps surfaces.",
  },
  {
    name: "single_month_calendar",
    pattern: /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+202[0-9]\b/i,
    reason: "single month calendars are easy to answer and crowded; they need strong printable/planner differentiation.",
  },
];

function googleNativeSearchText(row) {
  const components = row.canonical_key_components && typeof row.canonical_key_components === "object"
    ? row.canonical_key_components
    : {};
  return [
    row.keyword,
    row.intent_shape,
    row.canonical_opportunity_label,
    components.task_family,
    components.task_object,
    components.output_shape,
    components.input_pattern,
    row.recommended_shape,
    row.reason,
  ].filter(Boolean).join(" ");
}

function hasGoogleNativeEscapeHatch(row) {
  const text = googleNativeSearchText(row);
  return includesAny(text, [
    /\b(?:diagnostic|troubleshoot|workflow|checklist|planner|comparison|compare|selector|matrix|quote|pricing|cost|estimate|estimator)\b/i,
    /\b(?:batch|bulk|csv|api|upload|file|subtitle|downloadable|printable|worksheet|practice|quiz|step[- ]by[- ]step)\b/i,
    /\b(?:personalized|filter|filters|historical|visuali[sz]ation|calendar export|ics|meeting-time|team-size|seat|package)\b/i,
  ]);
}

function inferGoogleNativeAnswerRisk(row) {
  const explicitRisk = String(row.google_native_answer_risk || "").toLowerCase();
  if (googleNativeRiskValues.has(explicitRisk)) {
    return {
      risk: explicitRisk,
      source: "explicit",
      reason: row.google_native_risk_reason || `explicit ${explicitRisk} Google-native answer risk`,
      rule: "explicit",
    };
  }

  const text = googleNativeSearchText(row);
  const highRule = googleNativeHighRiskRules.find((rule) => rule.pattern.test(text));
  if (highRule) {
    return {
      risk: hasGoogleNativeEscapeHatch(row) ? "medium" : "high",
      source: "derived",
      reason: highRule.reason,
      rule: highRule.name,
    };
  }

  const mediumRule = googleNativeMediumRiskRules.find((rule) => rule.pattern.test(text));
  if (mediumRule) {
    return {
      risk: "medium",
      source: "derived",
      reason: mediumRule.reason,
      rule: mediumRule.name,
    };
  }

  const components = row.canonical_key_components && typeof row.canonical_key_components === "object"
    ? row.canonical_key_components
    : {};
  const taskFamily = String(components.task_family || row.intent_shape || "").toLowerCase();
  const outputShape = String(components.output_shape || "").toLowerCase();
  const simpleNativeTool =
    ["calculator", "converter", "lookup"].includes(taskFamily) &&
    ["deterministic_logic", "stable_public_data"].includes(row.answer_source_model) &&
    ["calculation", "conversion", "none", "unknown", undefined].includes(row.differentiation_basis) &&
    /(?:instant|single|copy|status_panel)/i.test(outputShape);

  if (simpleNativeTool) {
    return {
      risk: hasGoogleNativeEscapeHatch(row) ? "medium" : "high",
      source: "derived",
      reason: "simple calculator, converter, or lookup shape is vulnerable to Google widgets unless it adds durable workflow value.",
      rule: "simple_native_tool_shape",
    };
  }

  return {
    risk: "low",
    source: "derived",
    reason: "no obvious Google direct-answer or widget risk",
    rule: "none",
  };
}

function inferType(definition) {
  const text = `${definition.name} ${definition.pageShape}`.toLowerCase();
  if (/calculator|converter|checker|lookup|estimator|diagnostic|solver|generator|tracker|status|utility|translator|pronunciation/.test(text)) return "A";
  if (/template|planner|checklist|workflow|document|message|letter/.test(text)) return "B";
  if (/playable|simulator|quiz|practice|sound|audio|metronome/.test(text)) return "C";
  if (/training|practice|drill|course|workout|plan/.test(text)) return "D";
  if (/library|visual|creative|gallery|font|palette/.test(text)) return "E";
  if (/selector|comparison|configurator|kit|compatibility|buying|marketplace|saaS|platform/i.test(text)) return "F";
  return "B";
}

const clusterDefinitions = [
  {
    name: "B2B SaaS and platform selectors",
    priority: "P0",
    pageShape: "Requirements-based comparison database and recommendation flow",
    monetization: "SaaS affiliate, lead-gen, sponsored profiles",
    why: "Clear buyer intent, structured public data, and Reddit/forum rankings often indicate users distrust vendor roundups.",
    match: (text) => includesAny(text, [/software|saas|platform|competitor|competitors|alternative|alternatives|crm|data catalog|knowledge base|sales intelligence|digital asset management|autocad|ci tool|continuous integration/i]),
  },
  {
    name: "B2B pricing and alternatives estimators",
    priority: "P0",
    pageShape: "Configurable pricing estimator plus alternatives matrix",
    monetization: "SaaS affiliate, B2B lead-gen, vendor sponsorship",
    why: "Pricing intent is explicit and changes by package, seat, add-on, region, or use case.",
    match: (text) => includesAny(text, [/pricing|price estimate|pricing calculator|pricing estimator/i]) && includesAny(text, [/business|wire|platform|pitchbook|software|saas|vendor|distribution/i]),
  },
  {
    name: "Career salary and certification lead-gen",
    priority: "P0",
    pageShape: "Salary estimator by location, credential, setting, shift, and experience",
    monetization: "Course lead-gen, job leads, ads",
    why: "The result shape is a lookup/estimator, and monetization is stronger than generic informational articles.",
    match: (text) => includesAny(text, [/salary|wages?|pay rate|how much do .* make|how much .* make/i]),
  },
  {
    name: "Auto repair quote estimators",
    priority: "P0",
    pageShape: "Vehicle-aware parts and labor cost estimator",
    monetization: "Repair lead-gen, affiliate, ads",
    why: "Users are validating a quote; vehicle, parts, labor, and region materially change the answer.",
    match: (text) => includesAny(text, [/car |vehicle|brake|transmission|gearbox|oil change|timing|battery|spark plug|wheel|head gasket|catalytic|o2 sensor|cv axle|fuel pump|windshield|serpentine|valve cover|wrap/i]) && includesAny(text, [/cost|replacement|replace|change|price|estimator/i]),
  },
  {
    name: "OBD and warning-light diagnostics",
    priority: "P0",
    pageShape: "Diagnostic lookup with symptom branching, urgency, and repair-cost ranges",
    monetization: "Repair lead-gen, parts affiliate, ads",
    why: "Fault-code and warning-light searches are action-oriented and naturally map to a checker.",
    match: (text) => includesAny(text, [/\bp0[0-9]{3}\b|obd|warning light|service stabilitrak|tire pressure|traction control|abs light|battery light|check engine|car won't start|white smoke|blown head gasket/i]),
  },
  {
    name: "Home and local-service cost estimators",
    priority: "P0",
    pageShape: "Scope-based cost estimator and quote checklist",
    monetization: "Service lead-gen, affiliate, ads",
    why: "The query has cost intent, many variables, and a clear service or quote path.",
    match: (text) => includesAny(text, [/water softener|water heater|septic|storage unit|(?:whole[- ]house|home|backup|standby|portable)\s+generator|generator\s+(?:installation|cost|sizing|quote)|environmental site assessment|inspection checklist|propane|tattoo cost|bridal gown budget/i]),
  },
  {
    name: "PC, hardware, and equipment configurators",
    priority: "P0",
    pageShape: "Compatibility checker, build configurator, or kit selector",
    monetization: "Affiliate, sponsored listings, ads",
    why: "Users need a compatibility or configuration output, not a generic article.",
    match: (text) => includesAny(text, [/pc build|workstation build|can my pc|run on my computer|psu tier|ups runtime|satellite internet kit|solar generator|podcast equipment|3d printer|ebike/i]),
  },
  {
    name: "Fantasy and sports data tools",
    priority: "P0",
    pageShape: "Data-backed calculator, trade analyzer, or matchup lookup",
    monetization: "Ads, subscription, affiliate",
    why: "The expected result is interactive and recurring.",
    match: (text) => includesAny(text, [/fantasy|trade analyzer|trade calculator|\bdynasty\s+(?:football|basketball|baseball|rankings?|trade|value|rookie|superflex)|(?:football|basketball|baseball)\s+dynasty|batter vs pitcher|playoff predictor/i]),
  },
  {
    name: "Work calendar and pay calculators",
    priority: "P1",
    pageShape: "Calendar/pay calculator with assumptions and variants",
    monetization: "Ads, HR SaaS lead-gen",
    why: "The query is deterministic but assumption-sensitive.",
    match: (text) => includesAny(text, [/working days|working hours|an hour is how much|a year is how much an hour|hourly-to|salary-to-hourly/i]),
  },
  {
    name: "Travel, baggage, and document checkers",
    priority: "P1",
    pageShape: "Rule checker, visual sizer, or checklist calculator",
    monetization: "Affiliate, ads, lead-gen",
    why: "The user has a concrete constraint to satisfy.",
    match: (text) => includesAny(text, [/carry.?on|personal item|tsa|route 66|national parks|passport|identification|document checklist|airport|cruise/i]),
  },
  {
    name: "Device and network troubleshooting workflows",
    priority: "P1",
    pageShape: "Symptom-branching troubleshooter with tests and next actions",
    monetization: "Repair lead-gen, affiliate, ads",
    why: "Diagnostic flows beat scattered forum anecdotes.",
    match: (text) => includesAny(text, [/printer offline|tv to wifi|remote not working|computer.*slow|slow internet|ping|dns|message blocking|apple pencil|bluetooth|do not disturb|carplay|not charging|wifi health|autoplay|share wifi/i]),
  },
  {
    name: "Display and laptop symptom diagnostics",
    priority: "P1",
    pageShape: "Visual symptom checker with model, external-monitor, driver, and repair branches",
    monetization: "Repair lead-gen, affiliate, ads",
    why: "A structured diagnostic workflow can satisfy the task better than forum fragments.",
    match: (text) => includesAny(text, [/screen|display|flicker|backlight|horizontal line|white spot|black line|pink tint|no bootable|no screen|monitor|ipad streak|chromebook glitch|laptop/i]),
  },
  {
    name: "Compatibility and replacement-part lookups",
    priority: "P1",
    pageShape: "Model-aware compatibility lookup or adapter selector",
    monetization: "Affiliate, ads",
    why: "The user needs a correct fit/output.",
    match: (text) => includesAny(text, [/displayport|hdmi|usb|adapter|cable|filter|battery equivalent|battery lookup|key fob|license plate|replacement ring|compatible|compatibility|towing capacity|tire size|vin decoder|thermostat wiring|cookware|tank mate/i]),
  },
  {
    name: "Templates, planners, and life-admin generators",
    priority: "P1",
    pageShape: "Planner, checklist generator, or document/template builder",
    monetization: "Templates, ads, affiliate",
    why: "Users want a finished artifact or plan.",
    match: (text) => includesAny(text, [/wedding|budget|letter|message|email|resume|template|checklist|chore|grocery|planner|outline|interview|cheque|check-filling|out of office|thank you/i]),
  },
  {
    name: "Education, math, and chemistry solvers",
    priority: "P1",
    pageShape: "Step-by-step calculator, formula builder, or practice mode",
    monetization: "Ads, courses, tutoring lead-gen",
    why: "The expected output is computed or guided.",
    match: (text) => includesAny(text, [/asymptote|intercept|chemical|surface area|percent difference|solve|fraction|integral|derivative|moles|lewis|square root|weighted grade|excel|xlookup|formula|equation|conjugation/i]),
  },
  {
    name: "Music practice and instrument tools",
    priority: "P1",
    pageShape: "Interactive tuner, chord lookup, fingering trainer, or practice plan",
    monetization: "Ads, courses, affiliate",
    why: "Audio, diagrams, and practice loops beat static articles.",
    match: (text) => includesAny(text, [/guitar|chord|ukulele|tuner|tuning|circle of fifths|piano|scale|finger speed|dexterity/i]),
  },
  {
    name: "Training plans and interactive practice",
    priority: "P1",
    pageShape: "Personalized plan, drill tool, or simulator",
    monetization: "Ads, course, affiliate",
    why: "Users need something followable or interactive.",
    match: (text) => includesAny(text, [/marathon|couch to 5k|training plan|practice|trainer|drill|parallel park|teas|tape measure|enneagram|typing trainer|keyboard practice/i]),
  },
  {
    name: "Food and kitchen calculators",
    priority: "P1",
    pageShape: "Time, ratio, serving, substitution, and ingredient-density calculators",
    monetization: "Ads, affiliate",
    why: "The answer changes with ingredients, quantities, equipment, and preference.",
    match: (text) => includesAny(text, [/\b(?:egg|boil|cook|ribs|turkey|rice|coffee|steak|substitute|cornstarch|keg|grams?|spoons?|butter|garlic|tbsp|tsp|calorie|recipe|caffeine)\b|\b(?:\d+\s*)?cups?\s+(?:in|to|en|ml|grams?)\b|\b(?:mls?|milliliters?)\s+(?:a|per|in)\s+(?:tablespoon|cup)\b/i]),
  },
  {
    name: "Creative generators and visual libraries",
    priority: "P1",
    pageShape: "Filterable library, previewer, generator, or visualizer",
    monetization: "Ads, affiliate, templates",
    why: "Supply can be scaled with CC0/commercial assets, generated previews, and structured filters.",
    match: (text) => includesAny(text, [/drawing reference|palette|stain color|font|gradient|flag|cursive|fantasy name|surname|elf name|sewing pattern|3d printer files|banner size|text color|visualizer|generator/i]),
  },
  {
    name: "File, media, and image utilities",
    priority: "P1",
    pageShape: "Browser tool with upload, preview, conversion, and export",
    monetization: "Ads, paid batch processing, affiliate",
    why: "The result is a transformed file or image.",
    match: (text) => includesAny(text, [/heic|jpg|mkv|mp4|wav|ogg|pdf|epub|screenshot|grainy|overexposed|pixelated|reverse video/i]),
  },
  {
    name: "Marketplace and resale decision tools",
    priority: "P1",
    pageShape: "Value lookup, payout calculator, or marketplace selector",
    monetization: "Affiliate, lead-gen, ads",
    why: "The user wants to choose where to sell or estimate value.",
    match: (text) => includesAny(text, [/sell|shipping calculator|card value|coin value|penny|grading|copper price|marketplace|gift card/i]),
  },
  {
    name: "Consumer buying and comparison selectors",
    priority: "P1",
    pageShape: "Comparison matrix, weighted selector, or fit checker",
    monetization: "Affiliate, ads",
    why: "The searcher is deciding between options.",
    match: (text) => includesAny(text, [/\bvs\b|comparison|compare|king|iphone|android|pellet grill|snorkel|kamado|impact driver|drill|snowboard|what to wear|map of|equipment|selector/i]),
  },
  {
    name: "Simple but scalable converters",
    priority: "P2",
    pageShape: "Fast calculator/converter pages with batch and context variants",
    monetization: "Ads",
    why: "The intent is clear, but SERPs are often saturated.",
    match: (text) => includesAny(text, [/to miles|to feet|to lbs|to pounds|to mph|to f|fahrenheit|celsius|yard|meter|metre|kg|oz|inches|temperature|joule|kilowatt|horsepower|hours to minutes|converter|conversion/i]),
  },
  {
    name: "Symbols, timestamps, word finders, and tiny utilities",
    priority: "P2",
    pageShape: "Copy tool, generator, lookup, or picker",
    monetization: "Ads",
    why: "These are valid non-content utilities but lower commercial value and often crowded.",
    match: (text) => includesAny(text, [/symbol|timestamp|discord time|accent|word.*j|pick a number|roll d20|20 questions|controller test|printer test|stamps|shoe size|scam text|face identification|saturn return|dishwasher safe/i]),
  },
  {
    name: "Translation, transliteration, and pronunciation tools",
    priority: "P2",
    pageShape: "Input-output translator, transliterator, or audio pronunciation trainer",
    monetization: "Ads, language courses",
    why: "Intent is tool-shaped, but generic translator SERPs can be strong.",
    match: (text) => includesAny(text, [/translator|translation|translate|traduction|traduire|kreyol|créole|creole|korean|somali|bosnian|tamil|pronounce|pronunciation|language is this|old english|saxon/i]),
  },
  {
    name: "Real-time trackers and status pages",
    priority: "P2",
    pageShape: "Tracker with historical pattern and freshness indicator",
    monetization: "Ads, affiliate",
    why: "The product shape is clear, but data freshness and source access must be verified.",
    match: (text) => includesAny(text, [/wait times|crowd calendar|down right now|status checker|live reports/i]),
  },
  {
    name: "Other valid SERP-review opportunities",
    priority: "P2",
    pageShape: "Non-pure-content page matching the provided recommended_shape",
    monetization: "Ads, affiliate, lead-gen, templates, or SaaS",
    why: "The candidate passed legacy second-pass review but did not match a narrower built-in cluster.",
    match: () => true,
  },
];

const zhReportText = new Map([
  ["B2B SaaS and platform selectors", {
    name: "B2B SaaS 与平台选择器",
    pageShape: "基于需求的对比数据库和推荐流程",
    monetization: "SaaS 联盟分成、线索变现、赞助资料页",
    why: "用户有明确采购意图，需要结构化筛选；论坛或 Reddit 结果常说明用户不信任普通厂商榜单。",
  }],
  ["B2B pricing and alternatives estimators", {
    name: "B2B 定价与替代方案估算器",
    pageShape: "可配置的价格估算器加替代方案矩阵",
    monetization: "SaaS 联盟分成、B2B 线索、厂商赞助",
    why: "价格意图明确，而且会被套餐、席位、插件、地区和使用场景明显影响。",
  }],
  ["Career salary and certification lead-gen", {
    name: "职业薪资与证书线索",
    pageShape: "按地区、资质、工作场景、班次和经验筛选的薪资估算器",
    monetization: "课程线索、招聘线索、广告",
    why: "用户期待的是可查询、可比较的估算结果，商业价值通常强于普通信息文章。",
  }],
  ["Auto repair quote estimators", {
    name: "汽车维修报价估算器",
    pageShape: "按车型、零件和工时估算的维修费用工具",
    monetization: "维修线索、配件联盟分成、广告",
    why: "用户在验证报价，车型、零件、工时和地区都会实质改变答案。",
  }],
  ["OBD and warning-light diagnostics", {
    name: "OBD 与故障灯诊断",
    pageShape: "带症状分支、紧急程度和维修费用区间的诊断查询工具",
    monetization: "维修线索、配件联盟分成、广告",
    why: "故障码和警示灯搜索通常是行动导向，天然适合做检查器或诊断流程。",
  }],
  ["Home and local-service cost estimators", {
    name: "家居与本地服务费用估算器",
    pageShape: "按项目范围生成费用估算和报价清单",
    monetization: "服务线索、联盟分成、广告",
    why: "查询有费用或服务意图，变量多，并且后续路径通常是报价或预约。",
  }],
  ["PC, hardware, and equipment configurators", {
    name: "电脑、硬件与设备配置器",
    pageShape: "兼容性检查器、装机配置器或套装选择器",
    monetization: "联盟分成、赞助列表、广告",
    why: "用户需要兼容性或配置输出，而不是泛泛阅读一篇文章。",
  }],
  ["Fantasy and sports data tools", {
    name: "Fantasy 与体育数据工具",
    pageShape: "数据驱动的计算器、交易分析器或对阵查询工具",
    monetization: "广告、订阅、联盟分成",
    why: "预期结果具有互动性和复用性，适合做动态工具而不是静态内容。",
  }],
  ["Work calendar and pay calculators", {
    name: "工作日历与薪资换算器",
    pageShape: "带假设条件和变体的日历或薪资计算器",
    monetization: "广告、HR SaaS 线索",
    why: "答案相对确定，但会被年份、地区、假期和工作制影响。",
  }],
  ["Travel, baggage, and document checkers", {
    name: "旅行、行李与证件检查器",
    pageShape: "规则检查器、尺寸可视化工具或出行清单生成器",
    monetization: "联盟分成、广告、线索",
    why: "用户有明确限制要满足，工具化结果比普通说明更直接。",
  }],
  ["Device and network troubleshooting workflows", {
    name: "设备与网络故障排查流程",
    pageShape: "按症状分支的排查器，包含测试步骤和下一步动作",
    monetization: "维修线索、联盟分成、广告",
    why: "结构化诊断流程通常比零散论坛经验更能完成任务。",
  }],
  ["Display and laptop symptom diagnostics", {
    name: "屏幕与笔记本症状诊断",
    pageShape: "按机型、外接显示器、驱动和维修路径分支的视觉症状检查器",
    monetization: "维修线索、联盟分成、广告",
    why: "用户需要根据症状判断原因和处理路径，互动诊断比论坛片段更有效。",
  }],
  ["Compatibility and replacement-part lookups", {
    name: "兼容性与替换件查询",
    pageShape: "按型号识别的兼容性查询或适配器选择器",
    monetization: "联盟分成、广告",
    why: "用户需要一个正确匹配结果，错误答案的代价比普通信息查询更高。",
  }],
  ["Templates, planners, and life-admin generators", {
    name: "模板、计划器与生活事务生成器",
    pageShape: "计划器、清单生成器或文档模板生成器",
    monetization: "模板销售、广告、联盟分成",
    why: "用户想要一个可直接使用的成品或计划，而不是只读建议。",
  }],
  ["Education, math, and chemistry solvers", {
    name: "教育、数学与化学求解器",
    pageShape: "分步计算器、公式生成器或练习模式",
    monetization: "广告、课程、辅导线索",
    why: "用户期待的是可计算、可验证或可练习的输出。",
  }],
  ["Music practice and instrument tools", {
    name: "音乐练习与乐器工具",
    pageShape: "互动调音器、和弦查询、指法训练器或练习计划",
    monetization: "广告、课程、联盟分成",
    why: "音频、图示和练习循环明显优于静态文章。",
  }],
  ["Training plans and interactive practice", {
    name: "训练计划与互动练习",
    pageShape: "个性化计划、练习工具或模拟器",
    monetization: "广告、课程、联盟分成",
    why: "用户需要可跟随、可执行或可互动的训练过程。",
  }],
  ["Food and kitchen calculators", {
    name: "食物与厨房计算器",
    pageShape: "时间、比例、份量、替代品和密度计算器",
    monetization: "广告、联盟分成",
    why: "答案会被食材、数量、设备和偏好影响，适合做输入输出工具。",
  }],
  ["Creative generators and visual libraries", {
    name: "创意生成器与视觉素材库",
    pageShape: "可筛选素材库、预览器、生成器或可视化工具",
    monetization: "广告、联盟分成、模板",
    why: "供给侧可以通过 CC0/可商用素材、生成预览和结构化筛选规模化。",
  }],
  ["File, media, and image utilities", {
    name: "文件、媒体与图片工具",
    pageShape: "带上传、预览、转换和导出的浏览器工具",
    monetization: "广告、批量处理付费、联盟分成",
    why: "用户想得到一个被转换或修复后的文件，而不是阅读教程。",
  }],
  ["Marketplace and resale decision tools", {
    name: "市场与转售决策工具",
    pageShape: "价值查询、收益计算器或平台选择器",
    monetization: "联盟分成、线索、广告",
    why: "用户想判断去哪里卖、值多少钱或怎么获得更好回收结果。",
  }],
  ["Consumer buying and comparison selectors", {
    name: "消费品购买与对比选择器",
    pageShape: "对比矩阵、加权选择器或适配检查器",
    monetization: "联盟分成、广告",
    why: "用户正在做选择，结构化比较比泛泛榜单更有用。",
  }],
  ["Simple but scalable converters", {
    name: "简单但可规模化的转换器",
    pageShape: "快速计算或转换页面，支持批量和场景变体",
    monetization: "广告",
    why: "意图明确，但 SERP 往往拥挤，适合低优先级复核。",
  }],
  ["Symbols, timestamps, word finders, and tiny utilities", {
    name: "符号、时间戳、找词与小工具",
    pageShape: "复制工具、生成器、查询器或选择器",
    monetization: "广告",
    why: "这些是有效的非纯内容小工具，但商业价值较弱且竞争通常较密。",
  }],
  ["Translation, transliteration, and pronunciation tools", {
    name: "翻译、转写与发音工具",
    pageShape: "输入输出型翻译器、转写器或音频发音训练器",
    monetization: "广告、语言课程",
    why: "意图是工具型，但通用翻译 SERP 可能很强，需要进一步复核。",
  }],
  ["Real-time trackers and status pages", {
    name: "实时追踪器与状态页",
    pageShape: "带历史模式和新鲜度标记的追踪器",
    monetization: "广告、联盟分成",
    why: "产品形态清楚，但数据新鲜度和来源可得性需要确认。",
  }],
  ["Other valid SERP-review opportunities", {
    name: "其他值得 SERP 复核的机会",
    pageShape: "匹配推荐形态的非纯内容页面",
    monetization: "广告、联盟分成、线索、模板或 SaaS",
    why: "该候选通过了二筛，但没有命中更窄的内置词簇。",
  }],
]);

function reportText(definition) {
  return zhReportText.get(definition.name) || {
    name: definition.name,
    pageShape: definition.pageShape,
    monetization: definition.monetization,
    why: definition.why,
  };
}

const priorityOrder = { P0: 0, P1: 1, P2: 2 };
const hiddenMetricFields = ["volume", "traffic", "kd", "cpc", "position", "pos", "page", "url", "redditUrl", "landingPage", "landing_page"];

function isV2(row) {
  return Number(row.schema_version) === 2;
}

function slugComponent(value, fallback = "unknown") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return slug || fallback;
}

function canonicalKeyFromRow(row) {
  const components = row.canonical_key_components && typeof row.canonical_key_components === "object"
    ? row.canonical_key_components
    : {};
  const taskFamily = slugComponent(components.task_family);
  const entityStructure = slugComponent(components.entity_structure || row.entity_structure);
  const taskObject = slugComponent(components.task_object);
  const outputShape = slugComponent(components.output_shape);
  const inputPattern = slugComponent(components.input_pattern, "");

  if ([taskFamily, entityStructure, taskObject, outputShape].includes("unknown")) {
    const label = slugComponent(row.canonical_opportunity_label || row.intent_shape || "review");
    return {
      key: `unclustered/${label}`,
      missingComponents: true,
      components,
    };
  }

  return {
    key: [taskFamily, entityStructure, taskObject, outputShape, inputPattern].filter(Boolean).join("/"),
    missingComponents: false,
    components,
  };
}

function hasHiddenMetrics(row) {
  return hiddenMetricFields.some((field) => row[field] !== undefined);
}

function metadataFor(row, metadataByKeyword) {
  return metadataByKeyword.get(metadataKey(row)) || {};
}

function metricNumber(row, metadataByKeyword, field, aliases = []) {
  const metadata = metadataFor(row, metadataByKeyword);
  const values = [metadata[field], ...aliases.map((alias) => metadata[alias])];
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function legacyMetricNumber(row, metadataByKeyword, field, aliases = []) {
  const metadata = metadataFor(row, metadataByKeyword);
  const values = [row[field], ...aliases.map((alias) => row[alias]), metadata[field], ...aliases.map((alias) => metadata[alias])];
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return 0;
}

function typeFromIntent(row, fallbackDefinition) {
  const intent = String(row.intent_shape || "").toLowerCase();
  if (["calculator", "converter", "checker", "lookup", "tracker", "generator", "data_page"].includes(intent)) return "A";
  if (["workflow", "planner"].includes(intent)) return "B";
  if (intent === "training") return "D";
  if (intent === "library") return "E";
  if (intent === "comparison") return "F";
  if (fallbackDefinition) return inferType(fallbackDefinition);
  return row.type || "A";
}

function isDynamicSource(row) {
  return ["live_external_data", "licensed_or_proprietary_data", "official_or_marketplace_inventory"].includes(row.answer_source_model);
}

function isRealDifferentiation(row) {
  return row.differentiation_basis && !["none", "unknown"].includes(row.differentiation_basis);
}

function priorityFromHint(hint) {
  return ["P0", "P1", "P2"].includes(hint) ? hint : null;
}

function applyCap(priority, cap) {
  if (cap === "cap_P2") return "P2";
  if (cap === "cap_P1" && priority === "P0") return "P1";
  return priority;
}

function hasExplicitRejectSignal(row) {
  return row.route_hint === "reject" || row.subagent_cap_hint === "reject";
}

function shouldRejectForGoogleNative(row, googleNative) {
  return googleNative.risk === "high" &&
    googleNative.source === "explicit" &&
    hasExplicitRejectSignal(row);
}

function derivePriority(row, canonical) {
  const reasons = [];
  let derivedCap = "none";
  let derivedRoute = row.route_hint || "serp_review";
  const googleNative = inferGoogleNativeAnswerRisk(row);

  if (shouldRejectForGoogleNative(row, googleNative)) {
    return {
      priority: "P2",
      prioritySource: "derived",
      derivedCap: "reject",
      derivedRoute: "reject",
      derivedCapReason: `high Google-native answer risk: ${googleNative.reason}`,
      priorityReason: "Rejected because Google direct answers, AI Overview, or native SERP widgets can satisfy the query with little independent value-add.",
      googleNativeAnswerRisk: googleNative.risk,
      googleNativeRiskReason: googleNative.reason,
      googleNativeRiskSource: googleNative.source,
      googleNativeRiskRule: googleNative.rule,
    };
  }

  const noIndependentPath =
    row.non_content_advantage === "low" &&
    (!isRealDifferentiation(row)) &&
    ["weak", "unknown", undefined].includes(row.supply_control);
  const officialOnlyNoValue =
    row.answer_source_model === "official_or_marketplace_inventory" &&
    ["official_source", "marketplace"].includes(row.natural_winner) &&
    !isRealDifferentiation(row) &&
    ["weak", "unknown", undefined].includes(row.supply_control);

  if (noIndependentPath || (row.route_hint === "reject" && officialOnlyNoValue)) {
    return {
      priority: "P2",
      prioritySource: "derived",
      derivedCap: "reject",
      derivedRoute: "reject",
      derivedCapReason: noIndependentPath
        ? "no non-content advantage, no differentiation, and no plausible independent supply path"
        : "official or marketplace inventory with no independent value-add",
      priorityReason: "Derived reject; route_hint alone is not sufficient for rejection.",
      googleNativeAnswerRisk: googleNative.risk,
      googleNativeRiskReason: googleNative.reason,
      googleNativeRiskSource: googleNative.source,
      googleNativeRiskRule: googleNative.rule,
    };
  }

  if (googleNative.risk === "high") {
    derivedCap = "cap_P2";
    reasons.push(`high Google-native answer risk, kept for agent-reviewed evidence: ${googleNative.reason}`);
  } else if (googleNative.risk === "medium") {
    derivedCap = "cap_P2";
    reasons.push(`medium Google-native answer risk: ${googleNative.reason}`);
  }
  if (isDynamicSource(row) && ["weak", "unknown", undefined].includes(row.supply_control)) {
    derivedCap = "cap_P2";
    reasons.push("dynamic or official data with weak/unknown supply control");
  }
  if (row.freshness_need === "live" && ["high", "unknown", undefined].includes(row.maintenance_burden)) {
    derivedCap = "cap_P2";
    reasons.push("live freshness with high/unknown maintenance burden");
  }
  if (row.permutation_inflation === "high" && ["weak", "unknown", undefined].includes(row.supply_control)) {
    derivedCap = "cap_P2";
    reasons.push("high permutation inflation with weak/unknown canonical supply");
  }
  if (["official_source", "specialized_data_provider", "marketplace"].includes(row.natural_winner) && !isRealDifferentiation(row)) {
    derivedCap = "cap_P2";
    reasons.push("official/specialized natural winner with no clear differentiation");
  }
  if (row.priority_hint === "P0" && (
    ["unknown", undefined].includes(row.supply_control) ||
    ["unknown", undefined].includes(row.maintenance_burden) ||
    ["unknown", undefined].includes(row.natural_winner) ||
    canonical.missingComponents
  )) {
    derivedCap = "cap_P2";
    reasons.push("unknown critical supply or identity fields cannot support P0");
  }

  if (derivedCap === "none") {
    if (isDynamicSource(row) && row.supply_control === "medium" && isRealDifferentiation(row)) {
      derivedCap = "cap_P1";
      reasons.push("dynamic/external supply with medium control and real differentiation");
    } else if (["specialized_data_provider", "official_source"].includes(row.natural_winner) && isRealDifferentiation(row) && row.supply_control === "medium") {
      derivedCap = "cap_P1";
      reasons.push("natural winner is strong, but independent differentiation is credible");
    } else if (row.maintenance_burden === "medium" && row.supply_control !== "strong") {
      derivedCap = "cap_P1";
      reasons.push("maintenance burden is medium and supply control is not strong");
    }
  }

  const hintedPriority = priorityFromHint(row.priority_hint);
  const p0Eligible =
    row.non_content_advantage === "high" &&
    ["strong", "medium"].includes(row.supply_control) &&
    ["low", "medium"].includes(row.maintenance_burden) &&
    ["low", "medium", undefined].includes(row.legal_or_platform_risk) &&
    row.permutation_inflation !== "high" &&
    isRealDifferentiation(row) &&
    !canonical.missingComponents;

  let priority = "P2";
  if (hintedPriority === "P0" && p0Eligible) {
    priority = "P0";
  } else if (
    hintedPriority === "P1" ||
    hintedPriority === "P0" ||
    row.non_content_advantage === "high" ||
    (row.non_content_advantage === "medium" && isRealDifferentiation(row))
  ) {
    priority = "P1";
  }

  priority = applyCap(priority, derivedCap);
  if (derivedRoute === "reject") derivedRoute = priority === "P2" ? "cluster_seed" : "serp_review";

  return {
    priority,
    prioritySource: "derived",
    derivedCap,
    derivedRoute,
    derivedCapReason: reasons.join("; ") || "none",
    priorityReason: priority === "P0"
      ? "P0 allowed by strong supply control, bounded maintenance, clear differentiation, and high non-content advantage."
      : `Priority derived from semantic evidence${reasons.length ? `; cap applied: ${reasons.join("; ")}` : ""}.`,
    googleNativeAnswerRisk: googleNative.risk,
    googleNativeRiskReason: googleNative.reason,
    googleNativeRiskSource: googleNative.source,
    googleNativeRiskRule: googleNative.rule,
  };
}

function buildLegacyRow(row, definition, report, metadataByKeyword) {
  return {
    priority: definition.priority,
    priority_source: "legacy_regex",
    cluster: report.name,
    keyword: row.keyword,
    type: row.type || inferType(definition),
    volume: legacyMetricNumber(row, metadataByKeyword, "volume", ["search_volume", "searchVolume"]),
    kd: legacyMetricNumber(row, metadataByKeyword, "kd", ["keyword_difficulty", "keywordDifficulty"]),
    cpc: legacyMetricNumber(row, metadataByKeyword, "cpc"),
    page: legacyMetricNumber(row, metadataByKeyword, "page"),
    recommended_shape: row.recommended_shape || report.pageShape,
    monetization: row.monetization || report.monetization,
    risk: row.risk || "medium",
    reason: row.reason || report.why,
  };
}

function buildRejectedRow(row, reason, extra = {}) {
  return {
    keyword: String(row.keyword || "").trim(),
    derived_route: "reject",
    reason,
    ...extra,
  };
}

function buildV2Row(row, canonical, derivation, metadataByKeyword) {
  return {
    schema_version: 2,
    priority: derivation.priority,
    priority_source: derivation.prioritySource,
    priority_hint: row.priority_hint || "none",
    subagent_cap_hint: row.subagent_cap_hint || "none",
    subagent_cap_reason: row.subagent_cap_reason || "",
    derived_cap: derivation.derivedCap,
    derived_cap_reason: derivation.derivedCapReason,
    route_hint: row.route_hint || "serp_review",
    derived_route: derivation.derivedRoute,
    priority_reason: derivation.priorityReason,
    canonical_opportunity_key: canonical.key,
    canonical_opportunity_label: row.canonical_opportunity_label || canonical.key,
    cluster: row.canonical_opportunity_label || canonical.key,
    keyword: row.keyword,
    type: row.type || typeFromIntent(row),
    volume: metricNumber(row, metadataByKeyword, "volume", ["search_volume", "searchVolume"]),
    kd: metricNumber(row, metadataByKeyword, "kd", ["keyword_difficulty", "keywordDifficulty"]),
    cpc: metricNumber(row, metadataByKeyword, "cpc"),
    page: metricNumber(row, metadataByKeyword, "page"),
    recommended_shape: row.recommended_shape || row.canonical_opportunity_label || "Non-content page requiring SERP verification",
    monetization: row.monetization || "ads/affiliate/SaaS/lead-gen",
    risk: row.risk || row.legal_or_platform_risk || "medium",
    reason: row.reason || derivation.priorityReason,
    intent_shape: row.intent_shape || "unknown",
    answer_source_model: row.answer_source_model || "unknown",
    freshness_need: row.freshness_need || "unknown",
    entity_structure: row.entity_structure || canonical.components?.entity_structure || "unknown",
    non_content_advantage: row.non_content_advantage || "unknown",
    supply_control: row.supply_control || "unknown",
    natural_winner: row.natural_winner || "unknown",
    differentiation_basis: row.differentiation_basis || "unknown",
    maintenance_burden: row.maintenance_burden || "unknown",
    legal_or_platform_risk: row.legal_or_platform_risk || "unknown",
    permutation_inflation: row.permutation_inflation || "unknown",
    google_native_answer_risk: derivation.googleNativeAnswerRisk || row.google_native_answer_risk || "unknown",
    google_native_risk_reason: derivation.googleNativeRiskReason || row.google_native_risk_reason || "",
    google_native_risk_source: derivation.googleNativeRiskSource || "unknown",
    google_native_risk_rule: derivation.googleNativeRiskRule || "unknown",
    confidence: row.confidence || "medium",
    canonical_key_components: canonical.components || {},
    hidden_metrics_in_subagent_row: hasHiddenMetrics(row),
  };
}

function summarizeClusterRows(rows, field) {
  const counts = new Map();
  for (const row of rows) {
    const value = row[field] || "unknown";
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || "unknown";
}

const args = parseArgs(process.argv);
if (!args.input || !args["out-dir"]) {
  console.error("Usage: node cluster-recommendations.mjs --input final-reviewed-candidates.jsonl --out-dir site-dir [--metadata unique-keywords.jsonl]");
  process.exit(1);
}

const inputPath = path.resolve(args.input);
const outDir = path.resolve(args["out-dir"]);
const metadataPath = path.resolve(args.metadata || path.join(outDir, "unique-keywords.jsonl"));
const metadataRows = fs.existsSync(metadataPath) ? readJsonl(metadataPath) : [];
const metadataByKeyword = new Map(metadataRows.filter((row) => metadataKey(row)).map((row) => [metadataKey(row), row]));
const rows = readJsonl(inputPath).filter((row) => String(row.keyword || "").trim());
const seen = new Set();
const deduped = [];
const rejectedRows = [];

for (const row of rows) {
  const key = metadataKey(row);
  if (seen.has(key)) continue;
  seen.add(key);
  deduped.push({ ...row, keyword: String(row.keyword).trim() });
}

const clusterMap = new Map();
const keywordRows = [];

for (const row of deduped) {
  if (isV2(row)) {
    const canonical = canonicalKeyFromRow(row);
    const derivation = derivePriority(row, canonical);
    if (derivation.derivedRoute === "reject") {
      rejectedRows.push(buildRejectedRow(row, derivation.derivedCapReason, {
        schema_version: 2,
        google_native_answer_risk: derivation.googleNativeAnswerRisk || "unknown",
        google_native_risk_reason: derivation.googleNativeRiskReason || "",
        google_native_risk_source: derivation.googleNativeRiskSource || "unknown",
        google_native_risk_rule: derivation.googleNativeRiskRule || "unknown",
      }));
      continue;
    }

    const outputRow = buildV2Row(row, canonical, derivation, metadataByKeyword);
    const clusterKey = `v2:${canonical.key}`;
    if (!clusterMap.has(clusterKey)) {
      clusterMap.set(clusterKey, {
        priority: outputRow.priority,
        name: outputRow.canonical_opportunity_label,
        sourceName: canonical.key,
        canonical_opportunity_key: canonical.key,
        canonical_opportunity_label: outputRow.canonical_opportunity_label,
        pageShape: outputRow.recommended_shape,
        monetization: outputRow.monetization,
        why: outputRow.priority_reason,
        keywordRows: [],
        schemaVersion: 2,
      });
    }
    clusterMap.get(clusterKey).keywordRows.push(outputRow);
    keywordRows.push(outputRow);
    continue;
  }

  const text = `${row.keyword} ${row.type || ""} ${row.reason || ""} ${row.recommended_shape || ""}`.toLowerCase();
  const googleNative = inferGoogleNativeAnswerRisk(row);

  const definition = clusterDefinitions.find((cluster) => cluster.match(text));
  const report = reportText(definition);
  const clusterKey = `legacy:${definition.name}`;
  if (!clusterMap.has(clusterKey)) {
    clusterMap.set(clusterKey, {
      priority: definition.priority,
      name: report.name,
      sourceName: definition.name,
      pageShape: report.pageShape,
      monetization: report.monetization,
      why: report.why,
      keywordRows: [],
      schemaVersion: 1,
    });
  }

  const outputRow = buildLegacyRow(row, definition, report, metadataByKeyword);
  outputRow.google_native_answer_risk = googleNative.risk;
  outputRow.google_native_risk_reason = googleNative.reason;
  outputRow.google_native_risk_source = googleNative.source;
  outputRow.google_native_risk_rule = googleNative.rule;
  if (["medium", "high"].includes(googleNative.risk)) {
    outputRow.priority = "P2";
  }
  clusterMap.get(clusterKey).keywordRows.push(outputRow);
  keywordRows.push(outputRow);
}

const clusters = [...clusterMap.values()].map((cluster) => {
  cluster.keywordRows.sort((a, b) => Number(b.cpc || 0) - Number(a.cpc || 0) || Number(b.volume || 0) - Number(a.volume || 0));
  const bestPriority = cluster.keywordRows.reduce((best, row) => (
    priorityOrder[row.priority] < priorityOrder[best] ? row.priority : best
  ), "P2");
  const totalVolume = cluster.keywordRows.reduce((sum, row) => sum + Number(row.volume || 0), 0);
  const maxCpc = cluster.keywordRows.reduce((max, row) => Math.max(max, Number(row.cpc || 0)), 0);
  const kdValues = cluster.keywordRows.map((row) => Number(row.kd || 0)).filter((value) => Number.isFinite(value) && value > 0);
  const semanticSummary = cluster.schemaVersion === 2
    ? {
        dominant_intent_shape: summarizeClusterRows(cluster.keywordRows, "intent_shape"),
        dominant_answer_source_model: summarizeClusterRows(cluster.keywordRows, "answer_source_model"),
        dominant_freshness_need: summarizeClusterRows(cluster.keywordRows, "freshness_need"),
        dominant_supply_control: summarizeClusterRows(cluster.keywordRows, "supply_control"),
        dominant_natural_winner: summarizeClusterRows(cluster.keywordRows, "natural_winner"),
        dominant_permutation_inflation: summarizeClusterRows(cluster.keywordRows, "permutation_inflation"),
      }
    : undefined;
  return {
    ...cluster,
    priority: bestPriority,
    totalVolume,
    maxCpc,
    minKd: kdValues.length ? Math.min(...kdValues) : 0,
    semanticSummary,
  };
}).sort((a, b) => {
  const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
  if (priorityDiff) return priorityDiff;
  return b.maxCpc - a.maxCpc || b.totalVolume - a.totalVolume || a.name.localeCompare(b.name);
});

keywordRows.sort((a, b) => {
  const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
  if (priorityDiff) return priorityDiff;
  return Number(b.cpc || 0) - Number(a.cpc || 0) || Number(b.volume || 0) - Number(a.volume || 0);
});

const summary = {
  sourceCandidates: rows.length,
  rejectedCandidates: rejectedRows.length,
  recommendedClusters: clusters.length,
  recommendedKeywords: keywordRows.length,
  byPriority: Object.fromEntries(
    ["P0", "P1", "P2"].map((priority) => [
      priority,
      {
        clusters: clusters.filter((cluster) => cluster.priority === priority).length,
        keywords: keywordRows.filter((row) => row.priority === priority).length,
      },
    ]),
  ),
};

fs.mkdirSync(outDir, { recursive: true });

const jsonPath = path.join(outDir, "serp-review-recommendation-clusters.json");
const opportunityJsonPath = path.join(outDir, "opportunity-clusters.json");
const jsonlPath = path.join(outDir, "serp-review-recommendation-keywords.jsonl");
const rejectedJsonlPath = path.join(outDir, "serp-review-rejected-keywords.jsonl");
const mdPath = path.join(outDir, "serp-review-recommendations.md");
const opportunityMdPath = path.join(outDir, "opportunity-clusters.md");

fs.writeFileSync(jsonPath, JSON.stringify({ summary, clusters }, null, 2) + "\n");
fs.writeFileSync(opportunityJsonPath, JSON.stringify({ summary, clusters }, null, 2) + "\n");
fs.writeFileSync(jsonlPath, keywordRows.map((row) => JSON.stringify(row)).join("\n") + (keywordRows.length ? "\n" : ""));
fs.writeFileSync(rejectedJsonlPath, rejectedRows.map((row) => JSON.stringify(row)).join("\n") + (rejectedRows.length ? "\n" : ""));

const md = [];
md.push("# SERP 复核推荐词簇");
md.push("");
md.push(`二筛候选来源数：${summary.sourceCandidates}`);
md.push(`Google 原生答案/无独立供给剔除数：${summary.rejectedCandidates}`);
md.push(`推荐词簇数：${summary.recommendedClusters}`);
md.push(`推荐关键词条目数：${summary.recommendedKeywords}`);
md.push("");
md.push("| 优先级 | 词簇数 | 关键词条目数 |");
md.push("| --- | ---: | ---: |");
for (const priority of ["P0", "P1", "P2"]) {
  md.push(`| ${priority} | ${summary.byPriority[priority].clusters} | ${summary.byPriority[priority].keywords} |`);
}
md.push("");
md.push("优先级说明：");
md.push("- P0：优先复核；供给可控、维护有界、差异化清楚，且不是由排列组合搜索量硬抬上来。");
md.push("- P1：随后复核；机会成立，但数据供给、自然赢家或执行成本还需要确认。");
md.push("- P2：长尾、cluster seed、需数据源确认，或存在 Google 原生答案风险；不是自动拒绝。");
md.push("- 剔除：单值答案、通用计算/转换/翻译、区号/日期/符号等 Google 可直接满足且缺少独立价值的查询。");
md.push("");

for (const cluster of clusters) {
  md.push(`## ${cluster.priority} - ${cluster.name}`);
  md.push("");
  if (cluster.schemaVersion === 2) {
    const summaryBadges = cluster.semanticSummary || {};
    md.push(`- Canonical key: ${cluster.canonical_opportunity_key}`);
    md.push(`- Badges: Supply=${summaryBadges.dominant_answer_source_model || "unknown"}; Freshness=${summaryBadges.dominant_freshness_need || "unknown"}; Control=${summaryBadges.dominant_supply_control || "unknown"}; Winner=${summaryBadges.dominant_natural_winner || "unknown"}; Permutation=${summaryBadges.dominant_permutation_inflation || "unknown"}`);
  }
  md.push(`- 页面形态：${cluster.pageShape}`);
  md.push(`- 变现方式：${cluster.monetization}`);
  md.push(`- 为什么值得复核：${cluster.why}`);
  md.push(`- 关键词条目数：${cluster.keywordRows.length}；总搜索量：${cluster.totalVolume}；最高 CPC：${cluster.maxCpc}`);
  md.push("");
  md.push("| 关键词 | 搜索量 | KD | CPC | Cap | 推荐页面形态 |");
  md.push("| --- | ---: | ---: | ---: | --- | --- |");
  for (const row of cluster.keywordRows) {
    md.push(`| ${row.keyword} | ${row.volume} | ${row.kd} | ${row.cpc} | ${row.derived_cap || "legacy"} | ${String(row.recommended_shape).replaceAll("|", "/")} |`);
  }
  md.push("");
}

fs.writeFileSync(mdPath, md.join("\n"));
fs.writeFileSync(opportunityMdPath, md.join("\n"));

console.log(JSON.stringify({ summary, jsonPath, opportunityJsonPath, jsonlPath, rejectedJsonlPath, mdPath, opportunityMdPath }, null, 2));
