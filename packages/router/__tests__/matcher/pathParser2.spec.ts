import { tokenizePath, TokenType } from '../../src/matcher/pathTokenizer'
import { tokensToParser } from '../../src/matcher/pathParserRanker'
import { describe, expect, it } from 'vitest'

describe('Path parser', () => {
  it('/foo?-static', () => {
    const segments = tokenizePath('/:foo?-static')
    const path = tokensToParser(segments).stringify({})
    expect(segments).toEqual([
      [
        {
          type: TokenType.Param,
          value: 'foo',
          regexp: '',
          optional: true,
          repeatable: false,
        },
        { type: TokenType.Static, value: '-static' },
      ],
    ])
    expect(path).toBe('/-static')
  })
})
