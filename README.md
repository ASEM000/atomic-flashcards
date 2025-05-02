
![Logo](logo.svg)

<br>

This Obsidian plugin creates flashcards using AI by combining **atomic** notes - short notes capturing single ideas - into questions that test your understanding across concepts. Filter by tags, folders, and a prompt, and the plugin generates [Obsidian Spaced Repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) flashcards with footnotes to the source notes.

**Example**

Given atomic notes (defined by tags or in folders)

- `Symmetric Matrix.md`
- `Symmetric Positive Definite Matrix.md`
- `Spectral Theorem.md`
- ...

And topic prompt:

> How does the spectral theorem connect symmetry and positive definiteness?

The plugin outputs flashcards like:

Q: In what way does the spectral theorem connect the symmetry and positive definiteness of a matrix to its eigenvalue spectrum?

?

A: It shows any symmetric matrix is orthogonally diagonalizable. If also positive definite, all eigenvalues are positive.

^[[[`Symmetric Positive Definite Matrix.md`]]]^[[[`Symmetric Matrix.md`]]]^[[[`Spectral Theorem.md`]]]