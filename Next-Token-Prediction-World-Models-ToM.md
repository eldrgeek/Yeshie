# Next-Token Prediction, World Models, and Theory of Mind

**Prepared for Mike Wolf — April 12, 2026**

---

You're right that you're not the first to think in this direction — this is actually one of the most active debates in AI research right now, with serious researchers on both sides. Here's who's said what, roughly organized from "yes, world models emerge from prediction" to "no, they don't."

---

## The Case For: World Models Emerge From Next-Token Prediction

### Ilya Sutskever — "Prediction requires compression, compression requires understanding"

Sutskever (co-founder of OpenAI, now at SSI) has been the most prominent advocate of exactly your thesis. His core argument: the only way an LLM can be so good at predicting the next token is by actually compressing the data in a way that reflects the underlying reality of the world. He's argued that a sufficiently powerful next-token predictor must develop a world model — not as a design goal, but as a necessary intermediate representation.

He goes further: you can ask such a model "what would a person with great insight and wisdom do?" and because it has internalized the distribution of all human text, it may extrapolate beyond any individual human's capability.

- [Dwarkesh Patel interview with Sutskever](https://www.dwarkesh.com/p/ilya-sutskever) — the most detailed version of this argument
- [Glass Box Medicine: "Human and Artificial General Intelligence Arises from Next Token Prediction"](https://glassboxmedicine.com/2024/04/28/human-and-artificial-general-intelligence-arises-from-next-token-prediction/)


### Kenneth Li et al. — The Othello-GPT Experiment (Harvard/MIT, 2022)

This is probably the strongest empirical evidence for your intuition. Li trained a GPT-variant to predict legal moves in Othello. The model was never shown the board — just sequences of moves. Despite this, probing the model's internal representations revealed it had developed a representation of the board state. Even more strikingly, when researchers intervened to change the model's internal board representation, the model started making moves that were legal on the *new* board but illegal on the original — proving the representation was causally involved in the model's predictions, not just a correlational artifact.

The implication: "predict the next token" can produce genuine internal models of the process generating the tokens.

- [Original paper: "Emergent World Representations: Exploring a Sequence Model Trained on a Synthetic Task" (ICLR 2023)](https://arxiv.org/abs/2210.13382)
- [Neel Nanda's follow-up: "Actually, Othello-GPT Has A Linear Emergent World Representation"](https://www.neelnanda.io/mechanistic-interpretability/othello) — showed the world model is even more structured (linear) than originally thought


### Michal Kosinski — Spontaneous Emergence of Theory of Mind (Stanford, 2023)

This one is directly about theory of mind. Kosinski, a Stanford psychologist, tested GPT models on classic "false belief" tasks — the standard test for whether children understand that other people can hold beliefs that differ from reality. His findings:

- GPT-3 (May 2020): ~40% — comparable to 3.5-year-old children
- GPT-3.5 davinci-002 (Jan 2022): ~70% — comparable to 6-year-olds
- GPT-3.5 davinci-003 (Nov 2022): ~90% — comparable to 7-year-olds
- GPT-4 (Mar 2023): ~95%

His claim: theory of mind "spontaneously emerged as a byproduct of language models' improving language skills." Nobody engineered it. It appeared because modeling human language well enough requires modeling the mental states of the humans producing that language — which is exactly your intuition.

- [Original paper: "Theory of Mind May Have Spontaneously Emerged in Large Language Models" (arXiv, Feb 2023)](https://arxiv.org/abs/2302.02083)
- [Stanford GSB overview](https://www.gsb.stanford.edu/faculty-research/working-papers/theory-mind-may-have-spontaneously-emerged-large-language-models)
- [Published in PNAS: "Evaluating large language models in theory of mind tasks"](https://www.pnas.org/doi/10.1073/pnas.2405460121)


### Jacob Andreas — "Language Models as Agent Models" (MIT, 2022)

Andreas makes a precise version of your argument: when an LLM does next-word prediction on text produced by a human agent, it implicitly infers properties of that agent — their goals, knowledge, beliefs. In other words, the model isn't just predicting tokens; it's modeling the *agent* that would produce those tokens. This is a formal argument for why theory-of-mind-like capabilities should emerge from language modeling.

- [Paper: "Language Models as Agent Models" (EMNLP 2022)](https://aclanthology.org/2022.findings-emnlp.423/)
- [The Gradient podcast: "Jacob Andreas: Language, Grounding, and World Models"](https://thegradientpub.substack.com/p/jacob-andreas-language-grounding-world-models)


### Daniel Miessler — "World Model + Next Token Prediction = Answer Prediction"

Miessler (security researcher and popular AI commentator) has written a clear, accessible version of the argument: with an adequate understanding of the world, there's not much daylight between "next token prediction" and "answer prediction." The better the world model, the better the predictions — so the training signal pushes toward building richer world models.

- [Blog post: "World Model + Next Token Prediction = Answer Prediction"](https://danielmiessler.com/blog/world-model-next-token-prediction-answer-prediction)

---

## The Case Against / Skeptics

### Yann LeCun — "LLMs Are a Dead End"

LeCun (Meta's Chief AI Scientist, Turing Award winner) is the most prominent dissenter. He argues that next-token prediction is fundamentally insufficient for genuine world models because language only describes a part of the world. An LLM might know the *words* for why a cup can't pass through a table, but it doesn't have a causal simulation of physics. He proposes "World Models" based on Joint Embedding Predictive Architecture (JEPA) that operate in abstract feature spaces rather than token spaces.

His famous advice to PhD students: "LLMs are useful, but they are an off-ramp on the road to human-level AI. Don't work on LLMs."

- [Newsweek: "Yann LeCun says LLMs are on their way out"](https://www.newsweek.com/nw-ai/ai-impact-interview-yann-lecun-llm-limitations-analysis-2054255)
- [Medium summary: "World Models vs. Word Models"](https://medium.com/state-of-the-art-technology/world-models-vs-word-models-why-lecun-believes-llms-will-be-obsolete-23795e729cfa)


### Melanie Mitchell — "Heuristics, Not World Models" (Santa Fe Institute)

Mitchell takes a middle position. She argues that neural networks with large numbers of parameters can encode huge collections of heuristics that *look like* world models but are actually brittle when they encounter sufficiently novel situations. She distinguishes between statistical correlations (what LLMs use) and causal mechanisms (what real understanding requires). Her two-part series on Substack is the most thorough articulation of the skeptical case.

- [Substack: "LLMs and World Models, Part 1"](https://aiguide.substack.com/p/llms-and-world-models-part-1)
- [Substack: "LLMs and World Models, Part 2"](https://aiguide.substack.com/p/llms-and-world-models-part-2)
- [PNAS: "The debate over understanding in AI's large language models"](https://www.pnas.org/doi/10.1073/pnas.2215907120)


### Murray Shanahan — "Talking About Large Language Models" (Imperial College London / DeepMind)

Shanahan urges caution about anthropomorphizing LLMs. He acknowledges their remarkable capabilities but argues we need to be precise about what we mean when we say an LLM "understands" or "knows" — these words carry implications about consciousness and intentionality that may not apply. Interestingly, he later clarified he's not a reductionist about this; he's not saying LLMs *can't* have understanding, just that we need to be careful about how we talk about it.

- [Paper: "Talking About Large Language Models" (Communications of the ACM, 2024)](https://dl.acm.org/doi/10.1145/3624724)
- [Follow-up: "Still Talking About Large Language Models: Some Clarifications"](https://arxiv.org/abs/2412.10291)

---

## Recent Work (2025-2026)

### Mechanistic Evidence for Theory of Mind

A 2025 paper in *npj Artificial Intelligence* used sparse probing to find specific parameter patterns in LLMs that encode theory-of-mind reasoning — finding structured positional and relational representations that activate during false-belief tasks. This is the Othello-GPT approach applied to ToM: not just testing *whether* the capability exists, but finding *where* it lives in the network.

- [Nature: "How large language models encode theory-of-mind"](https://www.nature.com/articles/s44387-025-00031-9)

### From Next Token Prediction to STRIPS World Models

A 2025 paper showed that transformer models trained on next-token prediction of action traces can learn formal STRIPS planning models — and these models support planning with off-the-shelf symbolic planners over exponentially many unseen states and goals.

- [arXiv: "From Next Token Prediction to (STRIPS) World Models"](https://arxiv.org/html/2509.13389v4)

---

## The Bottom Line

Your intuition maps onto what's probably the central question in AI research right now: is next-token prediction a sufficient training signal for general intelligence, or is it a useful but fundamentally limited paradigm?

The empirical evidence (Othello-GPT, Kosinski's ToM tests, mechanistic probing) increasingly suggests that *some form* of world model and agent model does emerge from prediction. The debate is whether these emergent representations are "real" understanding or sophisticated-but-brittle pattern matching — and whether language alone provides enough signal, or whether grounding in the physical world is necessary.

Sutskever and LeCun represent the poles. Most researchers are somewhere in between, with the center of gravity shifting toward "more is happening inside these models than we expected" as the mechanistic interpretability evidence accumulates.
