## 2025-02-27 - Optimizing Map to Array conversions in game loop hot paths

**Learning:** `EntityMap.valuesArray()` caches values array conversion to reduce allocations, but spreading array args (`const arr = [...iterable]`) in loop functions defeated this performance gain. Furthermore, `.valuesArray()` returns an array, but functions like `findHit` accepted `Iterable<T>`, meaning they were compatible, but using `readonly T[]` is faster and communicates intent.

**Action:** Update hot-path iterators (like those in combat, mines, and vision files) to accept `readonly T[]` instead of `Iterable<T>`. When passing map data from loops to these functions, call `.valuesArray()` on custom maps instead of `.values()`.