# シングルサインオン（SSO）認証方式ガイド

本ドキュメントでは、Nextcloud で利用可能な SSO 認証方式について解説します。

---

## 認証プロトコルの概要

### 1. SAML 2.0（Security Assertion Markup Language）

**概要**: XML ベースの認証・認可プロトコル。主に企業や学術機関で使用される。

**特徴**:
- XML 形式でアサーション（認証情報）を交換
- IdP（Identity Provider）と SP（Service Provider）間で信頼関係を構築
- 属性情報（氏名、メールアドレス、所属等）の受け渡しが可能
- ブラウザベースの認証フローに特化

**代表的な実装**:
- Shibboleth（学術機関向け）
- Azure AD
- Okta
- OneLogin

**ユースケース**:
- 学術認証フェデレーション（学認、eduGAIN）
- 企業の統合認証基盤

---

### 2. OAuth 2.0

**概要**: 認可（Authorization）のためのプロトコル。リソースへのアクセス権限を委譲する。

**特徴**:
- 認可に特化（認証は本来の目的ではない）
- アクセストークンを使用してリソースにアクセス
- スコープによる権限の細分化が可能
- REST API との親和性が高い

**注意点**:
- OAuth 2.0 単体は「認可」プロトコルであり「認証」プロトコルではない
- 認証目的で使用する場合は、各プロバイダの独自拡張やプロファイル情報取得 API に依存

**代表的なプロバイダ**:
- GitHub
- Google
- Facebook
- Twitter

---

### 3. OpenID Connect（OIDC）

**概要**: OAuth 2.0 を拡張した認証プロトコル。OAuth 2.0 の上に認証レイヤーを追加。

**特徴**:
- OAuth 2.0 + 認証（ID トークン）
- JWT（JSON Web Token）形式の ID トークンを使用
- 標準化されたユーザー情報エンドポイント
- Discovery 機能による自動設定

**OAuth 2.0 との違い**:
| 項目 | OAuth 2.0 | OpenID Connect |
|------|-----------|----------------|
| 目的 | 認可（Authorization） | 認証（Authentication） |
| トークン | アクセストークン | アクセストークン + ID トークン |
| ユーザー情報 | 標準化されていない | 標準化（UserInfo エンドポイント） |

**代表的なプロバイダ**:
- Google
- Microsoft Azure AD
- Keycloak
- Auth0

---

### 4. LDAP（Lightweight Directory Access Protocol）

**概要**: ディレクトリサービスにアクセスするためのプロトコル。

**特徴**:
- ユーザー・グループ情報の一元管理
- 階層構造でデータを管理
- 認証とディレクトリ検索の両方に使用

**代表的な実装**:
- Microsoft Active Directory
- OpenLDAP
- FreeIPA

---

## プロトコル比較表

| 項目 | SAML 2.0 | OAuth 2.0 | OpenID Connect | LDAP |
|------|----------|-----------|----------------|------|
| 主な目的 | 認証 + 属性連携 | 認可 | 認証 | ディレクトリ + 認証 |
| データ形式 | XML | JSON | JSON (JWT) | バイナリ |
| トークン | アサーション | アクセストークン | ID トークン + アクセストークン | N/A |
| 主な用途 | エンタープライズ SSO | API アクセス委譲 | Web/モバイル認証 | 社内認証基盤 |
| 複雑さ | 高 | 中 | 中 | 中 |

---

## Nextcloud での実装

### SAML 認証

**アプリ**: SSO & SAML authentication（`user_saml`）

**リポジトリ**: https://github.com/nextcloud/user_saml

**インストール**:
```bash
docker exec -u www-data nextcloud php occ app:enable user_saml
```

**対応 IdP**:
- Azure AD
- Okta
- Keycloak
- Shibboleth（学認）
- その他 SAML 2.0 準拠の IdP

---

### OAuth2 / ソーシャルログイン

**アプリ**: Social Login（`sociallogin`）

**リポジトリ**: https://github.com/zorn-v/nextcloud-social-login

**注意**: これは公式アプリではなく、コミュニティ開発のアプリです。

**インストール**:
Nextcloud アプリストアから「Social Login」を検索してインストール

**対応プロバイダ**:
- GitHub
- Google
- Facebook
- Twitter
- Discord
- カスタム OAuth2 プロバイダ

**GitHub 連携の設定手順**:
1. GitHub で OAuth App を作成
   - Settings → Developer settings → OAuth Apps → New OAuth App
   - Authorization callback URL: `https://your-nextcloud.com/apps/sociallogin/custom_oauth2/github`
2. Client ID と Client Secret を取得
3. Nextcloud 管理画面 → Social Login → GitHub の設定に入力

---

### OpenID Connect 認証

**アプリ**: OpenID Connect user backend（`user_oidc`）

**リポジトリ**: https://github.com/nextcloud/user_oidc

**インストール**:
```bash
docker exec -u www-data nextcloud php occ app:enable user_oidc
```

**対応 IdP**:
- Keycloak
- Auth0
- Azure AD
- Google
- その他 OIDC 準拠の IdP

---

### LDAP 連携

**アプリ**: LDAP user and group backend（`user_ldap`）

**インストール**:
```bash
docker exec -u www-data nextcloud php occ app:enable user_ldap
```

**対応ディレクトリ**:
- Microsoft Active Directory
- OpenLDAP
- FreeIPA

---

## ユースケース別推奨方式

### GitHub 認証を使いたい場合

**推奨**: Social Login アプリ（OAuth2）

GitHub は OAuth 2.0 を提供しています。OpenID Connect には対応していません。

```
認証フロー:
1. ユーザーが「GitHub でログイン」をクリック
2. GitHub の認可画面にリダイレクト
3. ユーザーが許可
4. Nextcloud にコールバック
5. GitHub API でユーザー情報を取得
6. Nextcloud アカウントと紐付け/作成
```

---

### 学認（GakuNin）/ GakuNin RDM を使いたい場合

**推奨**: SSO & SAML authentication アプリ（SAML 2.0 / Shibboleth）

学認（GakuNin）は、国立情報学研究所（NII）が運営する学術認証フェデレーションです。Shibboleth ベースの SAML 2.0 を使用しています。

**前提条件**:
- 所属機関が学認フェデレーションに参加していること
- Nextcloud を SP（Service Provider）として学認に登録申請すること
- メタデータの交換と設定

**必要な属性**:
- eduPersonPrincipalName（ePPN）: 必須
- mail: メールアドレス
- displayName: 表示名

**参考**:
- [GakuNin RDM IdP 設定マニュアル](https://meatwiki.nii.ac.jp/confluence/pages/viewpage.action?pageId=67619606)
- [GakuNin RDM サポートポータル](https://support.rdm.nii.ac.jp/)

---

### 企業の Azure AD を使いたい場合

**推奨**: SSO & SAML authentication（SAML）または OpenID Connect user backend（OIDC）

Azure AD は SAML 2.0 と OIDC の両方に対応しています。

| 方式 | メリット | デメリット |
|------|----------|------------|
| SAML | 属性マッピングが柔軟 | 設定が複雑 |
| OIDC | 設定が比較的簡単 | 一部機能制限あり |

---

## セキュリティ考慮事項

1. **HTTPS 必須**: すべての SSO 方式で HTTPS が必須
2. **メタデータの検証**: SAML では IdP メタデータの署名を検証
3. **トークンの有効期限**: 適切な有効期限を設定
4. **ログアウト連携**: シングルログアウト（SLO）の設定を検討

---

## 参考リンク

- [Nextcloud SSO & SAML authentication アプリ](https://apps.nextcloud.com/apps/user_saml)
- [Nextcloud Social Login アプリ（GitHub）](https://github.com/zorn-v/nextcloud-social-login)
- [Nextcloud OpenID Connect アプリ](https://github.com/nextcloud/user_oidc)
- [学認（GakuNin）](https://www.gakunin.jp/)
- [GakuNin RDM サポートポータル](https://support.rdm.nii.ac.jp/)
- [OAuth 2.0 仕様（RFC 6749）](https://datatracker.ietf.org/doc/html/rfc6749)
- [OpenID Connect 仕様](https://openid.net/connect/)
- [SAML 2.0 仕様](http://docs.oasis-open.org/security/saml/v2.0/)
