# Publishing the SDKs

AskLedger ships five SDKs from this monorepo. Each publishes on its **own tag prefix**
so releases are independent.

| SDK | Package | Registry | Status | Release tag |
|-----|---------|----------|--------|-------------|
| TypeScript | `@askledger/receipts-sdk` | npm | ✅ Automated (`release.yml`, `publish.yml`) | `v*` |
| Python | `askledger-receipts` | PyPI | ⚙️ Workflow ready — add token | `python-v*` |
| Rust | `askledger-receipts` | crates.io | ⚙️ Workflow ready — add token | `rust-v*` |
| Java | `receipts-sdk` | Maven Central | 🚧 Template — needs setup | `java-v*` |
| Go | `.../go-sdk` | (module proxy) | ✅ `go get`-able, no publish step | tag `go-sdk/v*` |

---

## 1. Python → PyPI  *(ready)*

1. Create a free account at **https://pypi.org**.
2. Account settings → **API tokens** → *Add API token* (scope: entire account for the first
   publish; you can narrow it to the project afterwards). Copy the value (starts with `pypi-`).
3. In this GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `PYPI_API_TOKEN`  ·  Value: the token.
4. Release:
   ```bash
   git tag python-v0.1.0
   git push origin python-v0.1.0
   ```
   The **Publish Python SDK to PyPI** workflow builds and uploads automatically.

> More secure alternative (optional): PyPI **Trusted Publishing** (OIDC) removes the stored
> token. Configure a "pending publisher" on PyPI pointing at this repo + `publish-python.yml`,
> then delete the `TWINE_*` env and add `permissions: id-token: write` +
> `pypa/gh-action-pypi-publish`.

## 2. Rust → crates.io  *(ready)*

1. Sign in at **https://crates.io** with GitHub.
2. **Account Settings → API Tokens → New Token** (scope: publish-new + publish-update). Copy it.
3. Add repo secret `CARGO_REGISTRY_TOKEN` = the token.
4. Release:
   ```bash
   git tag rust-v0.1.0
   git push origin rust-v0.1.0
   ```

## 3. Java → Maven Central  *(needs setup — most involved)*

Maven Central is stricter than the others. Before `publish-java.yml` can work:

1. **Verify the namespace.** `java-sdk/pom.xml` uses `<groupId>org.askledger</groupId>` and the
   Java package is `org.askledger.receipts`. On Sonatype Central, verify the **`askledger.org`**
   domain (you own it) to claim `org.askledger`. If you would rather skip DNS verification,
   switch the groupId and the Java package base to **`io.github.askledger`**, which is
   auto-verified because you own the `askledger` GitHub org.
2. Register at **https://central.sonatype.com**, verify the namespace, and generate a
   **portal token** (user + password).
3. Create a **GPG key**, publish the public key to a keyserver, and export the private key.
4. ~~Add the signing + publishing plugins to `pom.xml`.~~ **Done.** `pom.xml` already includes
   `central-publishing-maven-plugin` (deploy phase) plus `maven-source`, `maven-javadoc` and
   `maven-gpg` in a `release` profile, and `<scm>` / `<developers>` blocks. Nothing to add.
5. Add repo secrets: `CENTRAL_TOKEN_USER`, `CENTRAL_TOKEN_PASS`,
   `MAVEN_GPG_PRIVATE_KEY`, `MAVEN_GPG_PASSPHRASE`.
6. Release with `git tag java-v0.1.0 && git push origin java-v0.1.0`.

So the only remaining prerequisites are account/credential steps (1, 2, 3, 5), which need a
person: the pom and workflow are ready.

## Notes

- The workflows also support **manual runs** via *Actions → (workflow) → Run workflow*.
- Bump the version in each SDK's manifest **before** tagging (they don't auto-bump):
  `python-sdk/pyproject.toml`, `rust-sdk/Cargo.toml`, `java-sdk/pom.xml`.
- Keep the site's install docs (askledger.org/developers) in sync as each registry goes live.
