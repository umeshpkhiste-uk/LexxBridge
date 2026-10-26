export type Religion = "Hindu" | "Islam" | "Christian" | "Sikh" | "Jain" | "Buddhist";

export type Festival = {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  religion: Religion;
  /** Short, two-line description shown on the festival's card. */
  description: string;
};

/**
 * Major festivals of India's largest religious communities, 2026 through
 * 2030 — a static, uneditable reference (not fetched, not user-editable).
 *
 * Dates for lunar/lunisolar calendars (Hindu, Islamic, Jain, Buddhist, and
 * Guru Nanak Jayanti) shift every Gregorian year and can vary by a day
 * depending on region or local moon sighting, the same caveat every
 * published panchang or Islamic calendar carries — entries marked
 * "(approx.)" are the most sighting-dependent. Verify locally for anything
 * date-critical.
 */
const DESC = {
  makarSankranti: "Marks the sun's shift into Capricorn and the start of warmer days — celebrated with kites and sesame sweets.",
  vasantPanchami: "Honours Goddess Saraswati, patron of learning and the arts, sought by students and artists.",
  mahaShivratri: "The 'Great Night of Shiva' — fasting and night-long prayers at Shiva temples across India.",
  holikaDahan: "Bonfires lit the evening before Holi, marking the triumph of devotion over evil.",
  holi: "The festival of colours — spring, and good's victory over evil, celebrated with coloured powders.",
  eidFitr: "Marks the end of Ramadan's month-long fast, celebrated with prayers, charity and festive meals.",
  ramNavami: "Celebrates the birth of Lord Rama, observed with readings of the Ramayana.",
  mahavirJayanti: "Marks the birth of Lord Mahavira, the 24th Jain Tirthankara, observed with charity.",
  goodFriday: "Commemorates the crucifixion of Jesus Christ, observed with prayer and solemn reflection.",
  easter: "Celebrates the resurrection of Jesus Christ — the central festival of the Christian year.",
  baisakhi: "Marks the Sikh New Year and founding of the Khalsa, celebrated with music and harvest festivities.",
  buddhaPurnima: "Commemorates the birth, enlightenment and passing of Gautama Buddha.",
  eidAdha: "The 'Festival of Sacrifice', commemorating Ibrahim's devotion, marked with prayers and charity.",
  guruPurnima: "Honours teachers and spiritual guides, marking the start of the Chaturmas period.",
  rakshaBandhan: "Celebrates sibling bonds — sisters tie a protective rakhi thread on their brothers' wrists.",
  janmashtami: "Celebrates the birth of Lord Krishna, marked with fasting and midnight prayers.",
  ganeshChaturthi: "Marks the birth of Lord Ganesha, celebrated with idol installations and immersion processions.",
  navratriBegins: "Nine nights honouring Goddess Durga, observed with fasting, dance and prayer.",
  durgaAshtami: "The eighth day of Navratri — the peak of Durga Puja rituals and offerings.",
  dussehra: "Marks Rama's victory over Ravana — good over evil — celebrated with effigy burnings.",
  diwali: "The festival of lights, marking Rama's return to Ayodhya — diyas, fireworks and family gatherings.",
  guruNanakJayanti: "Celebrates the birth of Guru Nanak, founder of Sikhism, marked with processions.",
  christmas: "Commemorates the birth of Jesus Christ, celebrated with church services and family gatherings.",
};

function yearFestivals(year: number, dates: Record<keyof typeof DESC, string>): Festival[] {
  const entry = (key: keyof typeof DESC, name: string, religion: Religion): Festival => ({
    date: `${year}-${dates[key]}`,
    name,
    religion,
    description: DESC[key],
  });
  return [
    entry("makarSankranti", "Makar Sankranti", "Hindu"),
    entry("vasantPanchami", "Vasant Panchami", "Hindu"),
    entry("mahaShivratri", "Maha Shivratri", "Hindu"),
    entry("holikaDahan", "Holika Dahan", "Hindu"),
    entry("holi", "Holi", "Hindu"),
    entry("eidFitr", "Eid-ul-Fitr (approx.)", "Islam"),
    entry("ramNavami", "Ram Navami", "Hindu"),
    entry("mahavirJayanti", "Mahavir Jayanti", "Jain"),
    entry("goodFriday", "Good Friday", "Christian"),
    entry("easter", "Easter Sunday", "Christian"),
    entry("baisakhi", "Baisakhi", "Sikh"),
    entry("buddhaPurnima", "Buddha Purnima", "Buddhist"),
    entry("eidAdha", "Eid-ul-Adha / Bakrid (approx.)", "Islam"),
    entry("guruPurnima", "Guru Purnima", "Hindu"),
    entry("rakshaBandhan", "Raksha Bandhan", "Hindu"),
    entry("janmashtami", "Janmashtami", "Hindu"),
    entry("ganeshChaturthi", "Ganesh Chaturthi", "Hindu"),
    entry("navratriBegins", "Navratri begins", "Hindu"),
    entry("durgaAshtami", "Durga Ashtami", "Hindu"),
    entry("dussehra", "Dussehra", "Hindu"),
    entry("diwali", "Diwali", "Hindu"),
    entry("guruNanakJayanti", "Guru Nanak Jayanti", "Sikh"),
    entry("christmas", "Christmas", "Christian"),
  ];
}

const FESTIVALS_2026 = yearFestivals(2026, {
  makarSankranti: "01-14",
  vasantPanchami: "01-23",
  mahaShivratri: "02-15",
  holikaDahan: "03-03",
  holi: "03-04",
  eidFitr: "03-20",
  ramNavami: "03-26",
  mahavirJayanti: "03-31",
  goodFriday: "04-03",
  easter: "04-05",
  baisakhi: "04-14",
  buddhaPurnima: "05-01",
  eidAdha: "05-27",
  guruPurnima: "07-29",
  rakshaBandhan: "08-28",
  janmashtami: "09-04",
  ganeshChaturthi: "09-14",
  navratriBegins: "10-11",
  durgaAshtami: "10-20",
  dussehra: "10-21",
  diwali: "11-08",
  guruNanakJayanti: "11-24",
  christmas: "12-25",
});

const FESTIVALS_2027 = yearFestivals(2027, {
  makarSankranti: "01-15",
  vasantPanchami: "02-11",
  mahaShivratri: "03-06",
  holikaDahan: "03-21",
  holi: "03-22",
  eidFitr: "03-09",
  ramNavami: "04-15",
  mahavirJayanti: "04-19",
  goodFriday: "03-26",
  easter: "03-28",
  baisakhi: "04-14",
  buddhaPurnima: "05-20",
  eidAdha: "05-16",
  guruPurnima: "07-18",
  rakshaBandhan: "08-17",
  janmashtami: "08-25",
  ganeshChaturthi: "09-04",
  navratriBegins: "09-30",
  durgaAshtami: "10-07",
  dussehra: "10-09",
  diwali: "10-29",
  guruNanakJayanti: "11-14",
  christmas: "12-25",
});

const FESTIVALS_2028 = yearFestivals(2028, {
  makarSankranti: "01-15",
  vasantPanchami: "01-31",
  mahaShivratri: "02-23",
  holikaDahan: "03-10",
  holi: "03-11",
  eidFitr: "02-26",
  ramNavami: "04-03",
  mahavirJayanti: "04-07",
  goodFriday: "04-14",
  easter: "04-16",
  baisakhi: "04-13",
  buddhaPurnima: "05-08",
  eidAdha: "05-05",
  guruPurnima: "07-06",
  rakshaBandhan: "08-05",
  janmashtami: "08-13",
  ganeshChaturthi: "08-23",
  navratriBegins: "09-18",
  durgaAshtami: "09-26",
  dussehra: "09-27",
  diwali: "10-17",
  guruNanakJayanti: "11-02",
  christmas: "12-25",
});

const FESTIVALS_2029 = yearFestivals(2029, {
  makarSankranti: "01-14",
  vasantPanchami: "01-19",
  mahaShivratri: "02-11",
  holikaDahan: "02-28",
  holi: "03-01",
  eidFitr: "02-15",
  ramNavami: "04-23",
  mahavirJayanti: "04-26",
  goodFriday: "03-30",
  easter: "04-01",
  baisakhi: "04-14",
  buddhaPurnima: "05-27",
  eidAdha: "04-24",
  guruPurnima: "07-25",
  rakshaBandhan: "08-23",
  janmashtami: "09-01",
  ganeshChaturthi: "09-11",
  navratriBegins: "10-07",
  durgaAshtami: "10-14",
  dussehra: "10-16",
  diwali: "11-05",
  guruNanakJayanti: "11-21",
  christmas: "12-25",
});

const FESTIVALS_2030 = yearFestivals(2030, {
  makarSankranti: "01-14",
  vasantPanchami: "02-07",
  mahaShivratri: "03-02",
  holikaDahan: "03-19",
  holi: "03-20",
  eidFitr: "02-04",
  ramNavami: "04-12",
  mahavirJayanti: "04-16",
  goodFriday: "04-19",
  easter: "04-21",
  baisakhi: "04-14",
  buddhaPurnima: "05-17",
  eidAdha: "04-13",
  guruPurnima: "07-15",
  rakshaBandhan: "08-13",
  janmashtami: "08-21",
  ganeshChaturthi: "09-01",
  navratriBegins: "09-27",
  durgaAshtami: "10-04",
  dussehra: "10-06",
  diwali: "10-26",
  guruNanakJayanti: "11-10",
  christmas: "12-25",
});

export const FESTIVALS: Festival[] = [
  ...FESTIVALS_2026,
  ...FESTIVALS_2027,
  ...FESTIVALS_2028,
  ...FESTIVALS_2029,
  ...FESTIVALS_2030,
].sort((a, b) => a.date.localeCompare(b.date));

export const FESTIVALS_MIN_YEAR = 2026;
export const FESTIVALS_MAX_YEAR = 2030;
