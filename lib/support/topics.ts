/** Stable support codes shared by the form, validation and staff notifications. */
export const TOPIC_CODES = ["TRACKING", "CHANGE", "CANCEL", "RETURN", "WRONG", "DAMAGED", "ADVICE", "ADVERSE", "OTHER"] as const;
export type TopicCode = (typeof TOPIC_CODES)[number];

export const topicReasons = {
  TRACKING: ["NOT_RECEIVED", "TRACKING_UPDATE", "DELIVERY_QUESTION"],
  CHANGE: ["ADDRESS", "ITEMS", "CONTACT_DETAILS"],
  CANCEL: ["CHANGED_MIND", "ORDERED_BY_MISTAKE", "DELIVERY_DELAY", "PURCHASED_ELSEWHERE", "WRONG_DETAILS", "MISSING_CODE"],
  RETURN: ["CHANGED_MIND", "UNSUITABLE", "RETURN_QUESTION"],
  WRONG: ["WRONG_ITEM", "MISSING_ITEM", "EXTRA_ITEM"],
  DAMAGED: ["PRODUCT_DAMAGED", "PARCEL_DAMAGED", "LEAKING"],
  ADVICE: ["CHOOSING_PRODUCT", "HOW_TO_USE", "PRODUCT_QUESTION"],
  ADVERSE: ["REACTION", "PRODUCT_SAFETY", "OTHER"],
  OTHER: ["OTHER"],
} as const satisfies Record<TopicCode, readonly string[]>;

export type ReasonCode = (typeof topicReasons)[TopicCode][number];
