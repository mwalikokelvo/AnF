# Kevo's ears: model vocabularies

`tokens.txt` of the two sherpa-onnx models Kevo downloads on first use (`src/kevo_ears.rs`). They are compiled into the app because the checked model download refuses `text/*` responses, which is how the Hugging Face Hub serves these small files. The models themselves are never in the installer or in git.

| File | Source (pinned commit) | Size | SHA-256 | Licence |
|---|---|---|---|---|
| `kws-tokens.txt` | https://huggingface.co/mobilebytesensei/sherpa-onnx-kws-zipformer-gigaspeech-3.3M/blob/e8ca74a794ce66e38a100e7c60c0214189ff4100/tokens.txt (identical to `tokens.txt` in k2-fsa's `kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2`) | 5,006 | `fd2ded4050a55d2b1578870ba8697d02371980217806b7558bd0a5cc60f3ba53` | Apache-2.0 |
| `asr-tokens.txt` | https://huggingface.co/csukuangfj/sherpa-onnx-streaming-zipformer-en-2023-06-26/blob/672fbf1b30579d6585301139bb363f42a0ad4a24/tokens.txt | 5,048 | `49e3c2646595fd907228b3c6787069658f67b17377c60aeb8619c4551b2316fb` | Apache-2.0 |
