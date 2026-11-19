# Kevo's ears: model vocabularies

`tokens.txt` of the two sherpa-onnx models Kevo downloads on first use (`src/kevo_ears.rs`). They are compiled into the app because the checked model download refuses `text/*` responses, which is how the Hugging Face Hub serves these small files. The models themselves are never in the installer or in git.

| File | Source (pinned commit) | Size | SHA-256 | Licence |
|---|---|---|---|---|
| `kws-tokens.txt` | `tokens.txt` in k2-fsa's https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20.tar.bz2 (also on the owner's mirror https://huggingface.co/mwalikokelvo/sherpa-onnx-kws-zipformer-zh-en-3M-2025-12-20) | 1,928 | `2d3f32311f9b692b964da3c90e830258d3e78e013cb0c992dbfb15cd5a1a71b0` | Apache-2.0 |
| `asr-tokens.txt` | https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26/blob/672fbf1b30579d6585301139bb363f42a0ad4a24/tokens.txt | 5,048 | `49e3c2646595fd907228b3c6787069658f67b17377c60aeb8619c4551b2316fb` | Apache-2.0 |
