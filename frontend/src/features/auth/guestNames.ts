import type { Locale } from '../../i18n/locale'

// 免註冊加入的預填名字：「形容詞＋名詞」，用網站目前的語言；避開負面或可能冒犯人的字。
const WORDS: Record<Locale, { adjectives: string[]; nouns: string[]; join(adjective: string, noun: string): string }> = {
  'zh-Hant': {
    adjectives: ['安靜的', '好奇的', '勇敢的', '溫柔的', '認真的', '開心的', '聰明的', '細心的', '自在的', '明亮的', '耐心的', '活潑的', '沉穩的', '大方的', '誠實的', '專注的', '樂觀的', '機靈的', '友善的', '從容的', '堅定的', '熱情的'],
    nouns: ['貓頭鷹', '海豚', '狐狸', '松鼠', '企鵝', '白鷺', '刺蝟', '鯨魚', '麻雀', '水獺', '兔子', '梅花鹿', '小熊', '燕子', '烏龜', '海獺', '浣熊', '山羊', '黑面琵鷺', '石虎', '藍鵲', '雲雀'],
    join: (adjective, noun) => adjective + noun,
  },
  'zh-Hans': {
    adjectives: ['安静的', '好奇的', '勇敢的', '温柔的', '认真的', '开心的', '聪明的', '细心的', '自在的', '明亮的', '耐心的', '活泼的', '沉稳的', '大方的', '诚实的', '专注的', '乐观的', '机灵的', '友善的', '从容的', '坚定的', '热情的'],
    nouns: ['猫头鹰', '海豚', '狐狸', '松鼠', '企鹅', '白鹭', '刺猬', '鲸鱼', '麻雀', '水獭', '兔子', '梅花鹿', '小熊', '燕子', '乌龟', '海獭', '浣熊', '山羊', '熊猫', '丹顶鹤', '喜鹊', '云雀'],
    join: (adjective, noun) => adjective + noun,
  },
  en: {
    adjectives: ['Quiet', 'Curious', 'Brave', 'Gentle', 'Thoughtful', 'Cheerful', 'Clever', 'Careful', 'Calm', 'Bright', 'Patient', 'Lively', 'Steady', 'Kind', 'Honest', 'Focused', 'Hopeful', 'Nimble', 'Friendly', 'Easygoing', 'Bold', 'Warm'],
    nouns: ['Owl', 'Dolphin', 'Fox', 'Squirrel', 'Penguin', 'Swan', 'Hedgehog', 'Whale', 'Sparrow', 'Otter', 'Rabbit', 'Deer', 'Bear', 'Swallow', 'Turtle', 'Raccoon', 'Goat', 'Lark', 'Robin', 'Panda', 'Koala', 'Seal'],
    join: (adjective, noun) => `${adjective} ${noun}`,
  },
  es: {
    adjectives: ['tranquilo', 'curioso', 'valiente', 'amable', 'atento', 'alegre', 'listo', 'cuidadoso', 'sereno', 'brillante', 'paciente', 'animado', 'firme', 'generoso', 'sincero', 'concentrado', 'optimista', 'ágil', 'simpático', 'calmado', 'decidido', 'cálido'],
    nouns: ['Búho', 'Delfín', 'Zorro', 'Pingüino', 'Erizo', 'Gorrión', 'Conejo', 'Ciervo', 'Oso', 'Pato', 'Mapache', 'Koala', 'Panda', 'Lobo', 'Halcón', 'Colibrí', 'Gato', 'Perro', 'Tucán', 'Cóndor', 'Tigre', 'León'],
    join: (adjective, noun) => `${noun} ${adjective}`,
  },
}

/** A pre-filled guest name in this locale; `random` is injectable for tests. */
export function guestName(locale: Locale, random: () => number = Math.random): string {
  const words = WORDS[locale]
  const pick = (list: string[]) => list[Math.floor(random() * list.length) % list.length]
  return words.join(pick(words.adjectives), pick(words.nouns))
}

export const GUEST_WORDS = WORDS

/** Characters as the backend counts them: an emoji is one, not two UTF-16 units. */
export function nameLength(name: string): number {
  return Array.from(name.trim()).length
}

export const GUEST_NAME_MAX = 40
