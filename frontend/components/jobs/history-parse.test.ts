import { describe, expect, it } from "vitest"
import type { JobHistoryItem } from "@/lib/host"
import { parseHistoryItem } from "./history-parse"

function item(partial: Partial<JobHistoryItem>): JobHistoryItem {
  return {
    jobId: "j1",
    kind: "generate",
    label: "Gen",
    status: "done",
    error: null,
    paramsJson: "{}",
    createdAt: 0,
    updatedAt: 1,
    galleryItems: [],
    ...partial,
  }
}

describe("parseHistoryItem", () => {
  it("parses generate gallery metadata and caches", () => {
    const thumb = {
      id: "t1",
      jobId: "j1",
      path: "a.png",
      thumbnailPath: null,
      metadataJson: JSON.stringify({
        prompt: "hi",
        values: { width: 512, height: 512, seed: 9 },
      }),
      createdAt: 0,
    }
    const first = parseHistoryItem(item({ galleryItems: [thumb] }))
    expect(first).toMatchObject({
      prompt: "hi",
      sizeLabel: "512×512",
      seedLabel: "9",
      metaLine: "512×512 · seed 9",
    })
    expect(parseHistoryItem(item({ galleryItems: [thumb] }))).toBe(first)
  })

  it("parses prompt-tool enhance and image-to-prompt", () => {
    const enhance = parseHistoryItem(
      item({
        jobId: "e1",
        kind: "prompt-tool",
        updatedAt: 2,
        paramsJson: JSON.stringify({
          prompt: "idea",
          mode: "expand",
          format: "general",
          result: { prompt: "enhanced", format: "enhance" },
        }),
      })
    )
    expect(enhance).toMatchObject({
      isEnhance: true,
      inputPrompt: "idea",
      outputPrompt: "enhanced",
      prompt: "enhanced",
      metaLine: "general · expand",
    })

    const i2p = parseHistoryItem(
      item({
        jobId: "i2p",
        kind: "prompt-tool",
        updatedAt: 3,
        paramsJson: JSON.stringify({
          imagePath: "/img.png",
          format: "json",
          result: { prompt: "from image" },
        }),
      })
    )
    expect(i2p).toMatchObject({
      isEnhance: false,
      inputImagePath: "/img.png",
      prompt: "from image",
      outputPrompt: "from image",
    })

    const blankEnhance = parseHistoryItem(
      item({
        jobId: "blank-enhance",
        kind: "prompt-tool",
        updatedAt: 4,
        paramsJson: JSON.stringify({
          prompt: "   ",
          mode: "expand",
          result: { prompt: "out", format: "enhance" },
        }),
      })
    )
    expect(blankEnhance.isEnhance).toBe(true)
    expect(blankEnhance.inputPrompt).toBeNull()

    const enhanceViaMode = parseHistoryItem(
      item({
        jobId: "mode-enhance",
        kind: "prompt-tool",
        updatedAt: 5,
        paramsJson: JSON.stringify({
          prompt: "idea",
          mode: "expand",
          result: { prompt: "done" },
        }),
      })
    )
    expect(enhanceViaMode.isEnhance).toBe(true)

    const noSize = parseHistoryItem(
      item({
        jobId: "no-size",
        updatedAt: 6,
        galleryItems: [
          {
            id: "t",
            jobId: "no-size",
            path: "a.png",
            thumbnailPath: null,
            metadataJson: JSON.stringify({
              prompt: "p",
              values: { width: 0, height: 512, seed: "" },
            }),
            createdAt: 0,
          },
        ],
      })
    )
    expect(noSize.sizeLabel).toBeNull()
    expect(noSize.seedLabel).toBeNull()

    const metaNoPrompt = parseHistoryItem(
      item({
        jobId: "meta-no-prompt",
        updatedAt: 7,
        galleryItems: [
          {
            id: "t",
            jobId: "meta-no-prompt",
            path: "a.png",
            thumbnailPath: null,
            metadataJson: JSON.stringify({ values: { width: 64, height: 64 } }),
            createdAt: 0,
          },
        ],
      })
    )
    expect(metaNoPrompt.prompt).toBeNull()
    expect(metaNoPrompt.sizeLabel).toBe("64×64")

    const enhanceNoResult = parseHistoryItem(
      item({
        jobId: "enhance-no-result",
        kind: "prompt-tool",
        updatedAt: 8,
        paramsJson: JSON.stringify({
          prompt: "idea",
          mode: "expand",
          result: { format: "enhance" },
        }),
      })
    )
    expect(enhanceNoResult).toMatchObject({
      isEnhance: true,
      inputPrompt: "idea",
      outputPrompt: null,
      prompt: "idea",
    })

    const enhanceFormatNull = parseHistoryItem(
      item({
        jobId: "enhance-null-format",
        kind: "prompt-tool",
        updatedAt: 9,
        paramsJson: JSON.stringify({
          prompt: "idea",
          result: { prompt: "done" },
        }),
      })
    )
    expect(enhanceFormatNull.isEnhance).toBe(true)

    const badResultType = parseHistoryItem(
      item({
        jobId: "bad-result",
        kind: "prompt-tool",
        updatedAt: 10,
        paramsJson: JSON.stringify({
          imagePath: "/x.png",
          result: { prompt: 123 },
        }),
      })
    )
    expect(badResultType.prompt).toBeNull()
  })

  it("ignores bad JSON and clears oversized cache", () => {
    expect(
      parseHistoryItem(
        item({
          jobId: "bad",
          updatedAt: 4,
          galleryItems: [
            {
              id: "t",
              jobId: null,
              path: "a.png",
              thumbnailPath: null,
              metadataJson: "{",
              createdAt: 0,
            },
          ],
        })
      ).prompt
    ).toBeNull()

    for (let i = 0; i < 2501; i++) {
      parseHistoryItem(
        item({
          jobId: `fill-${i}`,
          updatedAt: i,
          galleryItems: [],
        })
      )
    }
    expect(
      parseHistoryItem(item({ jobId: "after-clear", updatedAt: 9999 })).prompt
    ).toBeNull()
  })
})
