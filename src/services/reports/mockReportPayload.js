import { REPORT_PAYLOAD_VERSION } from "./reportPayload.types.js";

/** Fixed token for Phase 1 in-memory demo. */
export const PHASE1_DEMO_PUBLIC_TOKEN = "rpt_phase1_demo";

/**
 * Phase 1 mock — no DB, no scan flow.
 * @returns {import("./reportPayload.types.js").ReportPayload}
 */
export function createPhase1MockReportPayload() {
  return {
    reportId: "00000000-0000-4000-8000-000000000001",
    publicToken: PHASE1_DEMO_PUBLIC_TOKEN,
    scanId: "phase1-mock-scan",
    userId: "phase1-mock-line-user",
    birthdateUsed: "14/09/1995",
    generatedAt: "2026-03-19T10:00:00.000Z",
    reportVersion: REPORT_PAYLOAD_VERSION,
    object: {
      objectImageUrl: "",
      objectLabel: "วัตถุสายพลัง",
      objectType: "mock",
    },
    summary: {
      energyScore: 8.2,
      energyLevelLabel: "สูง",
      mainEnergyLabel: "ปกป้อง",
      compatibilityPercent: 78,
      summaryLine:
        "ชิ้นนี้เน้นพลังป้องกันและความนิ่งของจิต เหมาะกับช่วงที่ต้องการรากฐานภายในมากกว่าการเร่งแรง",
      wordingFamily: "protection",
      clarityLevel: "l2",
    },
    sections: {
      whatItGives: [
        "เสริมความรู้สึกปลอดภัยและมั่นคงในแต่ละวัน",
        "ช่วยให้จิตใจนิ่งขึ้นเมื่อต้องตัดสินใจ",
        "กระจายแรงกดดันออกจากจุดศูนย์กลางของคุณ",
        "เสริมความเชื่อมั่นต่อตัวเองในสถานการณ์ใหม่",
      ],
      messagePoints: [
        "ชิ้นนี้สื่อถึงการปกป้องและการรักษาสมดุล",
        "ไม่ได้เร่งโชคแบบฉับพลัน แต่สร้างพื้นที่ปลอดภัยให้คุณก้าวต่อไป",
      ],
      ownerMatchReason: [
        "สอดคล้องกับแรงดึงดูดของพลังดินในวันเกิดของคุณ",
        "ช่วงนี้คุณต้องการ ‘โล่พลัง’ มากกว่า ‘แสงแฟลช’",
      ],
      roleDescription:
        "ทำหน้าที่เป็นโล่พลังที่คอยกระจายความหนักแน่นรอบตัวผู้ใช้ ไม่ดึงดูดความขัดแย้งโดยตรง",
      bestUseCases: [
        "ก่อนเข้าเจรจาหรือพูดคุยสำคัญ",
        "ช่วงเครียดสูงหรือนอนไม่ค่อยหลับ",
        "วันที่ต้องตัดสินใจเรื่องความสัมพันธ์หรืองาน",
      ],
      weakMoments: [
        "อาจไม่โดดเด่นในวันที่คาดหวัง ‘ปาฏิหาริย์ทันที’",
        "ถ้าใช้แบบเพ้อฝันโดยไม่ลงมือทำ จะรู้สึกว่าชิ้นไม่ช่วยอะไร",
      ],
      guidanceTips: [
        "ใช้สมาธิสั้น ๆ 1–2 นาทีก่อนนอน โดยวางชิ้นบนฝ่ามือ",
        "สังเกตลมหายใจแทนการจ้องหาสัญญาณภายนอก",
      ],
      careNotes: [],
      miniRitual: [],
    },
    trust: {
      modelLabel: "phase1-mock",
      trustNote:
        "รายงานนี้จัดทำจากข้อมูลจำลองสำหรับ Phase 1 ไม่ใช่คำแนะนำทางการแพทย์หรือการเงิน",
      rendererVersion: "html-1.0.0",
    },
    actions: {
      historyUrl: "",
      rescanUrl: "",
      changeBirthdateUrl: "",
      lineHomeUrl: "https://line.me/",
    },
    wording: {
      objectLabel: "วัตถุสายพลัง",
      heroNaming: "พลังคุ้มกันสายตั้งหลัก",
      energyCharacter:
        "พลังของชิ้นนี้จะไปทางคุ้มกันและตั้งหลัก มากกว่าสายเร่งแรงจากภายนอก",
      mainEnergy: "ปกป้อง",
      secondaryEnergies: [],
      powerScore: 8.2,
      compatibilityScore: 78,
      energyBreakdown: {
        protection: 82,
        balance: 0,
        authority: 0,
        metta: 0,
        attraction: 0,
      },
      lifeTranslation:
        "เหมาะกับช่วงที่ต้องคุมใจ รับแรงกดดัน และตัดสินใจอย่างมั่นคง",
      bestFor: "ก่อนเข้าเจรจาหรือพูดคุยสำคัญ",
      notTheBestFor:
        "ไม่ใช่สายดึงดูดหรือเมตตาที่นำ — ถ้าต้องการโดดเด่นเรื่องเสน่ห์เป็นหลัก อาจไม่ใช่จุดแข็งของชิ้นนี้",
      practicalEffects: [
        "ช่วยให้ใจไม่แกว่งง่ายเวลาเจอแรงกดดัน",
        "เหมาะกับช่วงที่ต้องตัดสินใจเรื่องสำคัญ",
        "ช่วยประคองสติและแรงใจเมื่ออยู่ในบรรยากาศกดดัน",
      ],
      flexHeadline:
        "พลังของชิ้นนี้จะไปทางคุ้มกันและตั้งหลัก มากกว่าสายเร่งแรงจากภายนอก",
      flexBullets: [
        "ช่วยให้ใจไม่แกว่งง่ายเวลาเจอแรงกดดัน",
        "เหมาะกับช่วงที่ต้องตัดสินใจเรื่องสำคัญ",
      ],
      htmlOpeningLine:
        "พลังของชิ้นนี้จะไปทางคุ้มกันและตั้งหลัก เหมาะกับช่วงที่ต้องคุมใจและรับแรงกดดัน ช่วงที่เข้ากับชิ้นนี้: ก่อนเข้าเจรจาหรือพูดคุยสำคัญ",
      wordingFamily: "protection",
      clarityLevel: "l2",
    },
  };
}
