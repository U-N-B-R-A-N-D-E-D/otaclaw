# Hal Emmerich (Otacon) Personality Preset

OtaClaw can portray **Hal "Otacon" Emmerich** from [Metal Gear Solid](https://metalgear.fandom.com/wiki/Hal_Emmerich) — the genius scientist, loyal friend, and anime fan who supports Snake from the Codec.

## Enable the Hal personality

In `config/config.js` or `config.example.js`:

```javascript
personality: 'hal',
```

## Character traits reflected

| Trait | In OtaClaw |
|-------|------------|
| **Nerdy, self-deprecating** | Varied speech: "Crunchn' numbers", "My bad", "That wasn't..." |
| **Loyal, supportive** | "Roger that", "There we go", "Done!" |
| **Anime/otaku fan** | Light, playful tone in reactions |
| **Originally shy, grew confident** | Mix of tentative ("Hmm?") and assured ("Got it!") |
| **Science/tech mindset** | "Processing...", "Working on it" |

## Speech variety

The `hal` preset uses **arrays** of phrases per state. Each time a state is shown, a random phrase is picked. This avoids repetitive "Hmmm...." and gives Hal a more natural, varied voice.

## Customizing Hal's voice

Override specific keys in `config.personalities.hal`:

```javascript
personalities: {
  hal: {
    ...existingHalPreset,
    thinking: ['Hmmm....', 'Let me think...', 'One sec...', 'Are you an otaku too?'],
    success: ['Got it!', 'Roger that', 'Love can bloom on a battlefield!'],
  },
},
```

## Adding your own personality

Create a new preset in `config.personalities`:

```javascript
personalities: {
  hal: { /* ... */ },
  myCustom: {
    thinking: 'Processing...',
    success: ['Done!', 'All set!'],
    // ...
  },
},
```

Then set `personality: 'myCustom'`.

## References

- [Hal Emmerich – Metal Gear Wiki](https://metalgear.fandom.com/wiki/Hal_Emmerich)
- [Hal "Otacon" Emmerich – Pure Good Wiki](https://pure-good-heroes.fandom.com/wiki/Hal_%22Otacon%22_Emmerich)
