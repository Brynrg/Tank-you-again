# LLM Tank Arena — Match Report & Improvement Plan (2026-06-12)

Four local models each piloted a tank in a live headless instance of the real
Tank-you-again `Arena` sim (the exact engine production runs) and fought a
100-turn free-for-all (~4.2 game-minutes, 2.5 s of game time per decision).
Harness: `scripts/llm-arena.ts` · replay viewer generator: `scripts/llm-arena-replay.ts`
· full logs: `scripts/llm-arena-logs/2026-06-12T05-09-55/` (open `replay.html` to watch).

## Lineup

| Tank                | Model                     | Machine   | Endpoint           |
| ------------------- | ------------------------- | --------- | ------------------ |
| GLM-Coder (RED)     | GLM-4.7-Flash 8-bit       | MBP       | :8088 mlx_lm       |
| Heretic-35B (BLUE)  | Qwen3.6-35B Heretic 8-bit | MBP       | :8080 mlx_lm       |
| Granite-2B (ORANGE) | granite3.3-2b-ctx16k      | Mac Mini  | :11434 Ollama      |
| GLM-Air (PURPLE)    | glm-4.5-air               | DGX Spark | :4000 LiteLLM→vLLM |

(Gemma 12B sat out: on-demand/RAM-gated, and the game has exactly 4 team colors.
It's the natural 5th pilot for a team-mode rematch.)

## Result

| Pilot             | Kills  | Deaths | K/D     | Shots (B/M) | Fire orders in range (<600u) | Parse errors | Latency p50 |
| ----------------- | ------ | ------ | ------- | ----------- | ---------------------------- | ------------ | ----------- |
| **GLM-Air (DGX)** | **14** | **5**  | **2.8** | 341/2       | 24 %                         | 0/95         | 4.4 s       |
| Heretic-35B (MBP) | 14     | 7      | 2.0     | 312/7       | **50 %**                     | 0/93         | 6.4 s       |
| GLM-Coder (MBP)   | 7      | 12     | 0.6     | 50/35       | 27 %                         | 0/86         | 5.9 s       |
| Granite-2B (Mini) | 1      | 14     | 0.07    | 0/13        | 14 %                         | 0/82         | 0.9 s       |

Kill matrix: GLM-Air farmed the weakest player (8 of its 14 kills on Granite);
Heretic spread evenly (5/5/4); GLM-Coder tunnel-visioned Heretic (5 of 7).
Two deaths were self-inflicted mine blasts. Zero fuel-starvation deaths.
**Zero JSON parse failures in ~356 calls across all four models.**

## What each pilot actually did

- **GLM-Air — the winner's profile.** Predator target selection (hit the weak),
  near-exclusive use of cheap bullets, almost no item waste, and the tightest
  latency distribution (p90 4.8 s). Weakness: poor range discipline — median fire
  order at 997u where almost nothing lands; it ended the match at 4 fuel.
- **Heretic-35B — the brawler.** Highest aggression (fire order on 72 % of turns)
  and the best fire discipline (median 534u). Even target spread. Lost the K/D
  tiebreak by feeding GLM-Coder's counter-focus.
- **GLM-Coder — the gadget addict.** 31 of 40 fire orders were missiles, mostly
  launched at ~900u+ where they can't connect (25 fuel each). Burned ~1,300 fuel
  on 37 radar scans that were _literally useless_ (vision was unmasked — radar
  added no information) plus 29 shield toggles at 30 fuel/s. Most deaths among
  the big models. Classic over-tooling: every lever pulled, few pulled well.
- **Granite-2B — structurally fine, tactically absent.** Valid JSON every turn at
  0.9 s, but ~just `move_to`: oscillating waypoints, 8 % fire rate, 0 fuel crates,
  0 mines/teleports, and it once sent lowercase `"radar"` (silently rejected by
  the case-sensitive parser). A 2B holds the schema but not the battlefield.

## Improvement plan

### A. Better pilots (prompt & policy — cheap, do first)

1. **Per-model system prompts.** One prompt for all four was a handicap for the
   small model and a non-optimization for the big ones. Granite gets a 3-field
   schema (`move_to`, `fire`, `say`) plus one few-shot example and a standing
   rule ("if an enemy is within 600u, fire BULLET at it"). Big models get explicit
   range doctrine ("missiles only under 600u; bullets under 500u").
2. **In-match memory / scratchpad.** Turns are stateless today. Add a `"plan"`
   field the model writes and gets echoed back next turn, plus the last 2 turns'
   actions. Fixes Granite's waypoint amnesia and lets big models execute
   multi-turn strategies.
3. **Fire-control range gate with feedback.** When the chosen target is >800u,
   hold fire and tell the pilot "held fire — out of range" next turn instead of
   silently burning fuel. GLM-Air and GLM-Coder both bled fuel on hopeless shots.
4. **Hit/miss feedback.** Pilots never learn whether shots landed. Track
   per-owner projectile hits in the harness and report "3/10 bullets hit" each
   turn so models can calibrate range/lead behavior.

### B. Better harness & evaluation

5. **Case-insensitive enum parsing** (`"radar"` → `RADAR`) and accept common
   field aliases — free compliance for small models.
6. **Turn fog-of-war ON** (`snapshotFor(id, true)`). It's the real game (vision
   700u), it makes radar a real decision instead of a trap, and it tests
   scouting/inference. Models proved they can handle the action space; raise the
   bar.
7. **Richer scoreboard**: shot accuracy, damage dealt, fuel efficiency
   (kills per 1000 fuel spent), pickup conversion. Kills alone hide most skill.
8. **Repeated matches → ladder.** Single matches are noisy (spawn corners,
   pickup RNG). Script N matches with rotated spawns and keep a running ELO per
   model in `scripts/llm-arena-logs/ladder.json`.
9. **2v2 team mode.** 4 team colors → 2v2 with team-only `say` chat. Tests
   coordination and makes the trash talk channel load-bearing.
10. **Rotate the roster.** Mini also serves qwen3:8b / gpt-oss:20b /
    qwen3.5-35B-nvfp4; the MBP can wake Gemma-12B on demand; the DGX llama-swap
    has qwen-coder-32b. Same harness, new `PILOTS` entries.
11. **Latency: shrink the prompt.** MLX p50 ~6 s is mostly re-prefilling ~1.4k
    tokens every turn. Tighten the observation (drop static rules into a shorter
    system prompt, delta-encode state) or enable mlx_lm prompt caching; Granite's
    0.9 s shows the floor.

### C. Stack findings (recursive-improvement loop)

12. **`chat_template_kwargs:{enable_thinking:false}` works through the DGX
    LiteLLM → vLLM glm-4.5-air**: clean content-only answers at 1.2–4.4 s, vs the
    ~9 s thinking-on default. Worth setting in glm-air profiles where reasoning
    traces aren't wanted.
13. **Granite-2B capability calibration**: holds a JSON schema under pressure
    (100 % parse rate) but cannot do multi-constraint action selection. Keep the
    `cheap` role to single-purpose classify/extract; don't hand it agentic loops.
14. **Reliability**: ~360 sustained calls across 4 endpoints (2 machines remote),
    zero wedges, zero timeouts, zero 5xx. The watchdog/timeout layer is holding.
15. **Distillation corpus**: `decisions.jsonl` is 356 (observation → action)
    pairs with outcomes — exactly the trace shape for the offline role-finetune
    north star. Fine-tuning a 2-4B "pilot" on GLM-Air/Heretic winning traces and
    re-entering it in the ladder would close the loop: the arena becomes a
    self-improving eval.

## Re-run

```bash
cd ~/Desktop/Tank-you-again
SPARK_KEY=<dgx litellm master key> npx tsx scripts/llm-arena.ts --rounds 100 --window 50
npx tsx scripts/llm-arena-replay.ts scripts/llm-arena-logs/<stamp>   # → replay.html
```
