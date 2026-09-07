import Cocoa
import CryptoKit
import ImageIO
import JavaScriptCore
import PDFKit
import SQLite3
import UniformTypeIdentifiers
import Vision
import WebKit

let fm = FileManager.default
func jsonData(_ object: Any) throws -> Data {
  try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
}
func jsonObject(_ data: Data) throws -> Any { try JSONSerialization.jsonObject(with: data) }
struct AppError: LocalizedError {
  var message: String
  var errorDescription: String? { message }
}
func failure(_ text: String) -> AppError { AppError(message: text) }

// Native writes use the same validation rules as the interface, including restore and undo.
func validatedState(_ object: Any) throws -> [String: Any] {
  let resources =
    ProcessInfo.processInfo.environment["HEIDY_RESOURCES_DIR"].map { URL(fileURLWithPath: $0) }
    ?? Bundle.main.resourceURL!
  guard let context = JSContext() else { throw failure("Could not validate bakery records.") }
  context.evaluateScript(
    try String(contentsOf: resources.appendingPathComponent("model.js"), encoding: .utf8))
  guard context.exception == nil,
    let validate = context.objectForKeyedSubscript("HeidyModel")?.objectForKeyedSubscript(
      "validate")
  else { throw failure("The app's validation resource could not load.") }
  context.exception = nil
  _ = validate.call(withArguments: [object])
  if let error = context.exception { throw failure(error.toString() ?? "Invalid bakery data.") }
  guard let state = object as? [String: Any] else { throw failure("Invalid bakery data.") }
  return state
}
func emptyState() -> [String: Any] {
  [
    "version": 1, "ingredients": [[String: Any]](), "recipes": [[String: Any]](),
    "receipts": [[String: Any]](), "mappings": [String: Any](),
    "settings": [
      "laborRate": 24, "retailMarkup": NSNull(), "bulkMarkup": NSNull(), "alertPercent": 10,
      "staleDays": 365,
    ], "imported": false,
  ]
}
final class Store {
  let root: URL
  var db: OpaquePointer?
  init() throws {
    root =
      ProcessInfo.processInfo.environment["HEIDY_DATA_DIR"].map { URL(fileURLWithPath: $0) }
      ?? fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent(
        "Heidy Bakery", isDirectory: true)
    try fm.createDirectory(
      at: root.appendingPathComponent("Receipts"), withIntermediateDirectories: true)
    guard sqlite3_open(root.appendingPathComponent("Bakery.sqlite").path, &db) == SQLITE_OK else {
      throw failure("Could not open your bakery records.")
    }
    sqlite3_busy_timeout(db, 5000)
    try execute(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY CHECK(id=1),json TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY AUTOINCREMENT,json TEXT NOT NULL,created TEXT DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS inbox_seen(id TEXT PRIMARY KEY);"
    )
  }
  deinit { sqlite3_close(db) }
  func execute(_ sql: String) throws {
    if sqlite3_exec(db, sql, nil, nil, nil) != SQLITE_OK {
      throw failure(String(cString: sqlite3_errmsg(db)))
    }
  }
  func query(_ sql: String) throws -> String? {
    var st: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else {
      throw failure("Could not read bakery records.")
    }
    defer { sqlite3_finalize(st) }
    let result = sqlite3_step(st)
    if result == SQLITE_DONE { return nil }
    guard result == SQLITE_ROW else { throw failure("Could not read bakery records.") }
    return sqlite3_column_text(st, 0).map { String(cString: $0) }
  }
  func state() throws -> Any {
    guard let text = try query("SELECT json FROM state WHERE id=1") else { return NSNull() }
    return try validatedState(jsonObject(Data(text.utf8)))
  }
  func bind(_ sql: String, text: String) throws {
    var st: OpaquePointer?
    guard sqlite3_prepare_v2(db, sql, -1, &st, nil) == SQLITE_OK else {
      throw failure("Could not prepare save.")
    }
    defer { sqlite3_finalize(st) }
    sqlite3_bind_text(st, 1, text, -1, unsafeBitCast(-1, to: sqlite3_destructor_type.self))
    guard sqlite3_step(st) == SQLITE_DONE else { throw failure("Could not save records.") }
  }
  func seenReceiptIDs() throws -> Set<String> {
    let json = try query("SELECT json_group_array(id) FROM inbox_seen") ?? "[]"
    return Set((try jsonObject(Data(json.utf8))) as? [String] ?? [])
  }
  func save(_ object: Any) throws {
    let s = try validatedState(object)
    let data = try jsonData(s)
    guard data.count < 30_000_000 else { throw failure("Bakery data is too large to save.") }
    let text = String(decoding: data, as: UTF8.self)
    try execute("BEGIN IMMEDIATE")
    do {
      let previous = try query("SELECT json FROM state WHERE id=1")
      if previous == text {
        try execute("COMMIT")
        return
      }
      let baseline = try previous ?? String(decoding: jsonData(emptyState()), as: UTF8.self)
      if baseline != text { try bind("INSERT INTO history(json) VALUES(?)", text: baseline) }
      try bind("INSERT OR REPLACE INTO state(id,json) VALUES(1,?)", text: text)
      // Keep auto pickup from immediately reversing an undo. Manual checks can re-add a receipt.
      for r in s["receipts"] as? [[String: Any]] ?? [] {
        try bind("INSERT OR IGNORE INTO inbox_seen(id) VALUES(?)", text: r["id"] as! String)
      }
      try execute(
        "DELETE FROM history WHERE id NOT IN(SELECT id FROM history ORDER BY id DESC LIMIT 30); COMMIT"
      )
    } catch {
      try? execute("ROLLBACK")
      throw error
    }
  }
  func undo() throws -> Any {
    try execute("BEGIN IMMEDIATE")
    do {
      guard let text = try query("SELECT json FROM history ORDER BY id DESC LIMIT 1") else {
        throw failure("There is no earlier change to undo.")
      }
      let object = try validatedState(jsonObject(Data(text.utf8)))
      try execute(
        "UPDATE state SET json=(SELECT json FROM history ORDER BY id DESC LIMIT 1) WHERE id=1; DELETE FROM history WHERE id=(SELECT MAX(id) FROM history); COMMIT"
      )
      return object
    } catch {
      try? execute("ROLLBACK")
      throw error
    }
  }
  func backup() throws -> [String: Any] {
    guard let s = try state() as? [String: Any] else {
      throw failure("Save your bakery records before making a backup.")
    }
    var files: [String: String] = [:]
    var bytes = try jsonData(s).count
    for r in s["receipts"] as? [[String: Any]] ?? [] {
      let file = r["file"] as! String
      guard files[file] == nil else { continue }
      let data = try Data(contentsOf: root.appendingPathComponent("Receipts/" + file))
      bytes += ((data.count + 2) / 3) * 4 + file.utf8.count + 16
      guard bytes < 740_000_000 else {
        throw failure("This backup exceeds the supported 750 MB limit.")
      }
      files[file] = data.base64EncodedString()
    }
    return ["format": "heidy-backup-1", "state": s, "files": files]
  }
  static func checkBackup(_ data: Data) throws -> [String: Any] {
    guard data.count < 750_000_000, let b = try jsonObject(data) as? [String: Any],
      b["format"] as? String == "heidy-backup-1", let files = b["files"] as? [String: String]
    else { throw failure("This is not a supported bakery backup.") }
    guard let rawState = b["state"] else { throw failure("Backup is missing records.") }
    let s = try validatedState(rawState)
    guard try jsonData(s).count < 30_000_000 else {
      throw failure("Bakery data is too large to restore.")
    }
    for (key, value) in files {
      guard AppDelegate.safeName(key), let bytes = Data(base64Encoded: value),
        bytes.count <= 40_000_000
      else { throw failure("Invalid receipt in backup.") }
    }
    for r in s["receipts"] as? [[String: Any]] ?? [] {
      guard let file = r["file"] as? String, files[file] != nil else {
        throw failure("Backup is missing an original receipt.")
      }
    }
    return b
  }
  func restore(_ backup: [String: Any]) throws -> Any {
    let b = try Self.checkBackup(jsonData(backup))
    let s = b["state"]!
    let files = b["files"] as! [String: String]
    // Preflight every conflict before touching any originals; roll back new files on any failure.
    var missing: [(URL, Data)] = []
    for (key, value) in files {
      let url = root.appendingPathComponent("Receipts/" + key)
      let data = Data(base64Encoded: value)!
      if fm.fileExists(atPath: url.path) {
        guard try Data(contentsOf: url) == data else {
          throw failure("A receipt filename conflicts with this backup.")
        }
      } else {
        missing.append((url, data))
      }
    }
    let staging = root.appendingPathComponent(".restore-" + UUID().uuidString, isDirectory: true)
    try fm.createDirectory(at: staging, withIntermediateDirectories: false)
    defer { try? fm.removeItem(at: staging) }
    for (url, data) in missing {
      try data.write(to: staging.appendingPathComponent(url.lastPathComponent), options: .atomic)
    }
    var written: [URL] = []
    do {
      for (url, _) in missing {
        try fm.moveItem(at: staging.appendingPathComponent(url.lastPathComponent), to: url)
        written.append(url)
      }
      try save(s)
      return s
    } catch {
      for url in written { try? fm.removeItem(at: url) }
      throw error
    }
  }
}

func run(_ executable: String, _ args: [String], cwd: URL? = nil, limit: Int = 30_000_000) throws
  -> Data
{
  let p = Process()
  p.executableURL = URL(fileURLWithPath: executable)
  p.arguments = args
  p.currentDirectoryURL = cwd
  let out = Pipe()
  let errorURL = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  fm.createFile(atPath: errorURL.path, contents: nil)
  let errorFile = try FileHandle(forWritingTo: errorURL)
  defer {
    try? errorFile.close()
    try? fm.removeItem(at: errorURL)
  }
  p.standardOutput = out
  p.standardError = errorFile
  try p.run()
  var data = Data()
  while true {
    let chunk = out.fileHandleForReading.readData(ofLength: 65536)
    if chunk.isEmpty { break }
    guard data.count + chunk.count <= limit else {
      p.terminate()
      out.fileHandleForReading.closeFile()
      p.waitUntilExit()
      throw failure("Workbook content is too large.")
    }
    data.append(chunk)
  }
  p.waitUntilExit()
  guard p.terminationStatus == 0 else {
    let error = try Data(contentsOf: errorURL)
    throw failure(String(decoding: error.prefix(4000), as: UTF8.self))
  }
  return data
}
func xmlEscape(_ value: Any) -> String {
  String(describing: value).replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(
    of: "<", with: "&lt;"
  ).replacingOccurrences(of: ">", with: "&gt;").replacingOccurrences(of: "\"", with: "&quot;")
    .replacingOccurrences(of: "'", with: "&apos;")
}
func column(_ n: Int) -> String {
  var n = n + 1
  var s = ""
  while n > 0 {
    n -= 1
    s = String(UnicodeScalar(65 + n % 26)!) + s
    n /= 26
  }
  return s
}
func writeWorkbook(_ payload: [String: Any], to destination: URL) throws {
  guard let sheets = payload["sheets"] as? [[String: Any]], !sheets.isEmpty else {
    throw failure("No workbook content.")
  }
  let tmp = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  try fm.createDirectory(
    at: tmp.appendingPathComponent("xl/worksheets"), withIntermediateDirectories: true)
  try fm.createDirectory(
    at: tmp.appendingPathComponent("xl/_rels"), withIntermediateDirectories: true)
  try fm.createDirectory(at: tmp.appendingPathComponent("_rels"), withIntermediateDirectories: true)
  defer { try? fm.removeItem(at: tmp) }
  func put(_ path: String, _ text: String) throws {
    try text.write(to: tmp.appendingPathComponent(path), atomically: true, encoding: .utf8)
  }
  var manifest = ""
  var relationships = ""
  var overrides = ""
  for (index, sheet) in sheets.enumerated() {
    let n = index + 1
    guard let name = sheet["name"] as? String, let rows = sheet["rows"] as? [[Any]] else {
      throw failure("Invalid worksheet.")
    }
    manifest += "<sheet name=\"\(xmlEscape(name))\" sheetId=\"\(n)\" r:id=\"rId\(n)\"/>"
    relationships +=
      "<Relationship Id=\"rId\(n)\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet\(n).xml\"/>"
    overrides +=
      "<Override PartName=\"/xl/worksheets/sheet\(n).xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/>"
    func style(_ column: Int) -> Int {
      if name == "Price list" {
        if [10, 14].contains(column) { return 3 }
        if column >= 2 { return 2 }
      }
      if name == "Ingredients" {
        if column == 4 { return 2 }
        if column == 8 { return 5 }
      }
      if name == "Recipes" && [6, 7, 11, 12].contains(column) { return 2 }
      if name == "Lines" {
        if column == 9 { return 5 }
        if column == 11 { return 2 }
      }
      return 0
    }
    var body = ""
    for (ri, row) in rows.enumerated() {
      body += "<row r=\"\(ri+1)\">"
      for (ci, v) in row.enumerated() {
        let ref = "\(column(ci))\(ri+1)"
        if v is NSNull { continue }
        if let f = v as? [String: String], let formula = f["formula"] {
          body += "<c r=\"\(ref)\" s=\"\(style(ci))\"><f>\(xmlEscape(formula))</f></c>"
        } else if let num = v as? NSNumber {
          body += "<c r=\"\(ref)\" s=\"\(style(ci))\"><v>\(num)</v></c>"
        } else {
          body +=
            "<c r=\"\(ref)\" t=\"inlineStr\" s=\"\(ri==0 ? 1:0)\"><is><t xml:space=\"preserve\">\(xmlEscape(v))</t></is></c>"
        }
      }
      body += "</row>"
    }
    try put(
      "xl/worksheets/sheet\(n).xml",
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?><worksheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><sheetViews><sheetView workbookViewId=\"0\"><pane ySplit=\"1\" topLeftCell=\"A2\" activePane=\"bottomLeft\" state=\"frozen\"/></sheetView></sheetViews><cols><col min=\"1\" max=\"16\" width=\"22\" customWidth=\"1\"/></cols><sheetData>\(body)</sheetData></worksheet>"
    )
  }
  try put(
    "[Content_Types].xml",
    "<Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/styles.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml\"/>\(overrides)</Types>"
  )
  try put(
    "_rels/.rels",
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>"
  )
  try put(
    "xl/workbook.xml",
    "<workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><bookViews><workbookView activeTab=\"\(sheets.count > 4 ? 4 : 0)\"/></bookViews><sheets>\(manifest)</sheets><calcPr calcId=\"191029\" fullCalcOnLoad=\"1\"/></workbook>"
  )
  try put(
    "xl/_rels/workbook.xml.rels",
    "<Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\">\(relationships)<Relationship Id=\"styles\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles\" Target=\"styles.xml\"/></Relationships>"
  )
  try put(
    "xl/styles.xml",
    "<styleSheet xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\"><numFmts count=\"3\"><numFmt numFmtId=\"164\" formatCode=\"&quot;$&quot;#,##0.00\"/><numFmt numFmtId=\"165\" formatCode=\"0.0%\"/><numFmt numFmtId=\"166\" formatCode=\"&quot;$&quot;0.00000\"/></numFmts><fonts count=\"2\"><font><sz val=\"11\"/><name val=\"Calibri\"/></font><font><b/><sz val=\"11\"/><name val=\"Calibri\"/></font></fonts><fills count=\"2\"><fill><patternFill patternType=\"none\"/></fill><fill><patternFill patternType=\"gray125\"/></fill></fills><borders count=\"1\"><border/></borders><cellStyleXfs count=\"1\"><xf/></cellStyleXfs><cellXfs count=\"6\"><xf fontId=\"0\"/><xf fontId=\"1\" applyFont=\"1\"/><xf fontId=\"0\" numFmtId=\"164\" applyNumberFormat=\"1\"/><xf fontId=\"0\" numFmtId=\"165\" applyNumberFormat=\"1\"/><xf fontId=\"0\" numFmtId=\"0\"/><xf fontId=\"0\" numFmtId=\"166\" applyNumberFormat=\"1\"/></cellXfs><cellStyles count=\"1\"><cellStyle name=\"Normal\" xfId=\"0\" builtinId=\"0\"/></cellStyles></styleSheet>"
  )
  let archive = tmp.appendingPathComponent("result.xlsx")
  _ = try run(
    "/usr/bin/zip", ["-q", "-r", archive.path, "[Content_Types].xml", "_rels", "xl"], cwd: tmp)
  let data = try Data(contentsOf: archive)
  try data.write(to: destination, options: .atomic)
}

final class WorkbookXML: NSObject, XMLParserDelegate {
  var sheets: [String: String] = [:], rels: [String: String] = [:], strings: [String] = [],
    rows: [[Any]] = []
  var text = "", type = "", ref = "", value = "", row: [Any] = [], inText = false, inValue = false,
    inSI = false, shared = "", hasFormula = false
  var sharedStrings: [String] = []
  func parser(
    _ p: XMLParser, didStartElement e: String, namespaceURI: String?, qualifiedName: String?,
    attributes a: [String: String]
  ) {
    if e == "sheet" { sheets[a["name"] ?? ""] = a["r:id"] ?? "" }
    if e == "Relationship" { rels[a["Id"] ?? ""] = a["Target"] ?? "" }
    if e == "row" { row = [] }
    if e == "c" {
      type = a["t"] ?? ""
      ref = a["r"] ?? ""
      value = ""
      hasFormula = false
    }
    if e == "f" { hasFormula = true }
    if e == "si" {
      inSI = true
      shared = ""
    }
    if e == "t" { inText = true }
    if e == "v" { inValue = true }
  }
  func parser(_ p: XMLParser, foundCharacters s: String) {
    if inSI && inText { shared += s } else if inText || inValue { value += s }
  }
  func parser(
    _ p: XMLParser, didEndElement e: String, namespaceURI: String?, qualifiedName: String?
  ) {
    if e == "t" { inText = false }
    if e == "v" { inValue = false }
    if e == "si" {
      strings.append(shared)
      inSI = false
    }
    if e == "c" {
      var col = 0
      for u in ref.uppercased().unicodeScalars {
        if u.value >= 65 && u.value <= 90 { col = col * 26 + Int(u.value) - 64 } else { break }
      }
      guard col > 0, col <= 100 else { return }
      while row.count < col { row.append(NSNull()) }
      if hasFormula {
        row[col - 1] = ["formula": true, "cached": value]
      } else if type == "s", let n = Int(value), n >= 0, n < sharedStrings.count {
        row[col - 1] = sharedStrings[n]
      } else if type == "inlineStr" || type == "str" {
        row[col - 1] = value
      } else if let n = Double(value) {
        row[col - 1] = n
      } else {
        row[col - 1] = value.isEmpty ? NSNull() : value as Any
      }
    }
    if e == "row" { rows.append(row) }
  }
  static func read(_ data: Data, shared: [String] = []) throws -> WorkbookXML {
    guard data.count < 30_000_000 else { throw failure("Worksheet too large.") }
    let d = WorkbookXML()
    d.sharedStrings = shared
    let p = XMLParser(data: data)
    p.shouldResolveExternalEntities = false
    p.delegate = d
    guard p.parse() else { throw failure("Could not read workbook XML.") }
    return d
  }
}
func readWorkbook(_ file: URL) throws -> [String: Any] {
  let size = (try file.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0
  guard size < 20_000_000 else { throw failure("Choose a workbook smaller than 20 MB.") }
  func entry(_ name: String) throws -> Data { try run("/usr/bin/unzip", ["-p", file.path, name]) }
  let wb = try WorkbookXML.read(entry("xl/workbook.xml"))
  let rels = try WorkbookXML.read(entry("xl/_rels/workbook.xml.rels"))
  let shared = (try? WorkbookXML.read(entry("xl/sharedStrings.xml")).strings) ?? []
  var result: [String: Any] = [:]
  for name in ["Ingredients", "Recipes", "Lines", "Settings"] {
    guard let id = wb.sheets[name], let target = rels.rels[id], !target.contains(".."),
      !target.contains("\\"),
      target.rangeOfCharacter(from: CharacterSet(charactersIn: "*?[]")) == nil
    else { throw failure("Use an Excel workbook exported by Heidy Bakery. Missing sheet: \(name)") }
    let path = target.hasPrefix("/") ? String(target.dropFirst()) : "xl/" + target
    result[name] = try WorkbookXML.read(entry(path), shared: shared).rows
  }
  return result
}

final class ReceiptScanner {
  static let extensions: Set<String> = ["jpg", "jpeg", "png", "heic", "heif", "pdf", "tif", "tiff"]
  private var stamps: [String: String] = [:]
  private var hashes: [String: (String, String)] = [:]
  static func stamp(_ url: URL) throws -> String {
    let v = try url.resourceValues(forKeys: [.fileSizeKey, .contentModificationDateKey])
    return "\(v.fileSize ?? 0):\(v.contentModificationDate?.timeIntervalSince1970 ?? 0)"
  }
  func collect(
    _ urls: [URL], root: URL, known: Set<String>, ignored: Set<String> = [], automatic: Bool
  ) -> [String: Any] {
    var records: [[String: Any]] = []
    var errors: [String] = []
    var seen = known
    var duplicates = 0
    var pending = 0
    for original in urls.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) {
      var url = original
      do {
        if url.pathExtension.lowercased() == "icloud" {
          var name = url.deletingPathExtension().lastPathComponent
          if name.hasPrefix(".") { name.removeFirst() }
          url = url.deletingLastPathComponent().appendingPathComponent(name)
          guard Self.extensions.contains(url.pathExtension.lowercased()) else { continue }
          try fm.startDownloadingUbiquitousItem(at: url)
          pending += 1
          continue
        }
        guard Self.extensions.contains(url.pathExtension.lowercased()) else { continue }
        let values = try url.resourceValues(forKeys: [
          .isRegularFileKey, .fileSizeKey, .isUbiquitousItemKey,
          .ubiquitousItemDownloadingStatusKey,
        ])
        if values.isUbiquitousItem == true && values.ubiquitousItemDownloadingStatus != .current {
          try fm.startDownloadingUbiquitousItem(at: url)
          pending += 1
          continue
        }
        guard values.isRegularFile == true else { continue }
        guard (values.fileSize ?? 0) <= 40_000_000 else { throw failure("Receipt exceeds 40 MB.") }
        let fingerprint = try Self.stamp(url)
        let old = stamps[url.path]
        stamps[url.path] = fingerprint
        if (values.fileSize ?? 0) == 0 || (automatic && old != fingerprint) {
          pending += 1
          continue
        }
        if let (savedStamp, hash) = hashes[url.path], savedStamp == fingerprint,
          seen.contains(hash) || (automatic && ignored.contains(hash))
        {
          duplicates += 1
          continue
        }
        var coordinationError: NSError?
        var readResult: Result<Data, Error>?
        NSFileCoordinator().coordinate(readingItemAt: url, options: [], error: &coordinationError) {
          coordinated in
          readResult = Result { try Data(contentsOf: coordinated) }
        }
        if let error = coordinationError { throw error }
        guard let result = readResult else { throw failure("Could not read the receipt.") }
        let data = try result.get()
        guard data.count <= 40_000_000 else { throw failure("Receipt exceeds 40 MB.") }
        guard !data.isEmpty, try Self.stamp(url) == fingerprint else {
          pending += 1
          continue
        }
        let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
        hashes[url.path] = (fingerprint, hash)
        if seen.contains(hash) || (automatic && ignored.contains(hash)) {
          duplicates += 1
          continue
        }
        records.append(try AppDelegate.receipt(url, root: root, bytes: data))
        seen.insert(hash)
      } catch { errors.append(original.lastPathComponent + ": " + error.localizedDescription) }
    }
    return ["records": records, "errors": errors, "duplicates": duplicates, "pending": pending]
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler,
  WKNavigationDelegate
{
  var window: NSWindow!, web: WKWebView!, store: Store!
  var pendingRestore: [String: Any]?
  let receiptQueue = DispatchQueue(label: "com.heidybakery.receipts", qos: .userInitiated)
  let scanner = ReceiptScanner()
  func inboxURL() throws -> URL? {
    if let path = ProcessInfo.processInfo.environment["HEIDY_RECEIPT_INBOX"] {
      return path.isEmpty ? nil : URL(fileURLWithPath: path)
    }
    if let data = UserDefaults.standard.data(forKey: "receiptInboxBookmark") {
      var stale = false
      let url = try URL(
        resolvingBookmarkData: data, options: [.withSecurityScope, .withoutUI], relativeTo: nil,
        bookmarkDataIsStale: &stale)
      if stale { try rememberInbox(url) }
      return url
    }
    return UserDefaults.standard.string(forKey: "receiptInbox").map { URL(fileURLWithPath: $0) }
  }
  func rememberInbox(_ url: URL) throws {
    let access = url.startAccessingSecurityScopedResource()
    defer { if access { url.stopAccessingSecurityScopedResource() } }
    let data = try url.bookmarkData(
      options: [.withSecurityScope], includingResourceValuesForKeys: nil, relativeTo: nil)
    UserDefaults.standard.set(data, forKey: "receiptInboxBookmark")
    UserDefaults.standard.set(url.path, forKey: "receiptInbox")
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    do { store = try Store() } catch {
      let a = NSAlert()
      a.messageText = "Heidy Bakery could not open"
      a.informativeText = error.localizedDescription
      a.runModal()
      NSApp.terminate(nil)
      return
    }
    let menu = NSMenu()
    let appItem = NSMenuItem()
    menu.addItem(appItem)
    let appMenu = NSMenu()
    appItem.submenu = appMenu
    appMenu.addItem(
      withTitle: "Quit Heidy Bakery", action: #selector(NSApplication.terminate(_:)),
      keyEquivalent: "q")
    let editItem = NSMenuItem()
    editItem.title = "Edit"
    menu.addItem(editItem)
    let edit = NSMenu(title: "Edit")
    editItem.submenu = edit
    for (name, action, key) in [
      ("Undo", "undo:", "z"), ("Cut", "cut:", "x"), ("Copy", "copy:", "c"),
      ("Paste", "paste:", "v"), ("Select All", "selectAll:", "a"),
    ] { edit.addItem(withTitle: name, action: Selector(action), keyEquivalent: key) }
    NSApp.mainMenu = menu
    let config = WKWebViewConfiguration()
    config.userContentController.add(self, name: "native")
    web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = self
    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1200, height: 840),
      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false
    )
    window.title = "Heidy’s Bakery"
    window.minSize = NSSize(width: 760, height: 560)
    window.contentView = web
    window.center()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    let url = Bundle.main.resourceURL!.appendingPathComponent("index.html")
    web.loadFileURL(url, allowingReadAccessTo: Bundle.main.resourceURL!)
  }
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    guard CommandLine.arguments.contains("--ui-smoke") else { return }
    do {
      guard ProcessInfo.processInfo.environment["HEIDY_DATA_DIR"] != nil,
        let path = ProcessInfo.processInfo.environment["HEIDY_UI_TEST_SCRIPT"]
      else { throw failure("Native UI tests require isolated data and an explicit test script.") }
      let script = try String(contentsOfFile: path, encoding: .utf8)
      webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { result in
        switch result {
        case .success(let value):
          print(value)
          exit(0)
        case .failure(let error):
          fputs("Native UI failed: " + error.localizedDescription + "\n", stderr)
          exit(1)
        }
      }
    } catch {
      fputs(error.localizedDescription + "\n", stderr)
      exit(1)
    }
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
  func webView(
    _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    let url = action.request.url
    decisionHandler(
      url?.isFileURL == true && url!.path.hasPrefix(Bundle.main.resourceURL!.path + "/")
        ? .allow : .cancel)
  }
  func reply(_ id: String, _ value: Any = NSNull(), error: String? = nil) {
    let object: [String: Any] = ["id": id, "result": value, "error": error as Any? ?? NSNull()]
    guard let data = try? jsonData(object) else { return }
    web.evaluateJavaScript(
      "window.nativeReply(\(String(decoding:data,as:UTF8.self)))", completionHandler: nil)
  }
  func panel(_ title: String, save: Bool = false, name: String = "", types: [UTType] = []) -> URL? {
    if save {
      let p = NSSavePanel()
      p.title = title
      p.nameFieldStringValue = name
      if !types.isEmpty { p.allowedContentTypes = types }
      return p.runModal() == .OK ? p.url : nil
    }
    let p = NSOpenPanel()
    p.title = title
    p.canChooseDirectories = false
    p.allowsMultipleSelection = false
    if !types.isEmpty { p.allowedContentTypes = types }
    return p.runModal() == .OK ? p.url : nil
  }
  func userContentController(
    _ userContentController: WKUserContentController, didReceive message: WKScriptMessage
  ) {
    guard message.frameInfo.isMainFrame, let m = message.body as? [String: Any],
      let id = m["id"] as? String, let action = m["action"] as? String
    else { return }
    let payload = m["payload"] as? [String: Any] ?? [:]
    do {
      switch action {
      case "load":
        let seed = try jsonObject(
          Data(contentsOf: Bundle.main.resourceURL!.appendingPathComponent("seed.json")))
        reply(
          id,
          [
            "state": try store.state(), "seed": seed, "dataPath": store.root.path,
            "inbox": ProcessInfo.processInfo.environment["HEIDY_RECEIPT_INBOX"]
              ?? (try? inboxURL()?.path) ?? UserDefaults.standard.string(forKey: "receiptInbox")
              ?? "",
          ])
      case "save":
        try store.save(payload)
        reply(id, true)
      case "undo": reply(id, try store.undo())
      case "chooseInbox":
        let p = NSOpenPanel()
        p.title = "Choose the All new receipts folder"
        p.canChooseDirectories = true
        p.canChooseFiles = false
        if p.runModal() == .OK, let url = p.url {
          try rememberInbox(url)
          reply(id, url.path)
        } else {
          reply(id)
        }
      case "importReceipts", "scanInbox":
        let folder = action == "scanInbox" ? try inboxURL() : nil
        var selected: [URL] = []
        if action == "scanInbox" && folder == nil {
          throw failure("Choose your receipt folder in Settings first.")
        }
        if action == "importReceipts" {
          let p = NSOpenPanel()
          p.title = "Add receipt photos or PDFs"
          p.allowedContentTypes = [.image, .pdf]
          p.allowsMultipleSelection = true
          if p.runModal() == .OK {
            selected = p.urls
          } else {
            reply(id)
            return
          }
        }
        let root = store.root
        let automatic = payload["automatic"] as? Bool ?? false
        let previous = (try store.state() as? [String: Any])?["receipts"] as? [[String: Any]] ?? []
        let known = Set(previous.compactMap { $0["id"] as? String })
        let ignored = try store.seenReceiptIDs()
        let chosen = selected
        receiptQueue.async {
          let access = folder?.startAccessingSecurityScopedResource() ?? false
          defer { if access { folder?.stopAccessingSecurityScopedResource() } }
          do {
            let urls =
              try folder.map { try fm.contentsOfDirectory(at: $0, includingPropertiesForKeys: nil) }
              ?? chosen
            let result = self.scanner.collect(
              urls, root: root, known: known, ignored: ignored, automatic: automatic)
            DispatchQueue.main.async { self.reply(id, result) }
          } catch {
            DispatchQueue.main.async {
              self.reply(
                id,
                error: "Choose the receipt folder again in Settings: " + error.localizedDescription)
            }
          }
        }
      case "previewReceipt":
        guard let key = payload["file"] as? String, Self.safeName(key) else {
          throw failure("Invalid receipt file.")
        }
        let url = store.root.appendingPathComponent("Receipts/" + key)
        let data = try Data(contentsOf: url)
        let image = try Self.preview(data, ext: url.pathExtension)
        reply(id, "data:image/png;base64," + image.base64EncodedString())
      case "openReceipt":
        guard let key = payload["file"] as? String, Self.safeName(key) else {
          throw failure("Invalid receipt file.")
        }
        NSWorkspace.shared.open(store.root.appendingPathComponent("Receipts/" + key))
        reply(id, true)
      case "exportExcel":
        if let url = panel(
          "Export editable Excel workbook", save: true, name: "Heidy Bakery.xlsx",
          types: [UTType(filenameExtension: "xlsx")!])
        {
          try writeWorkbook(payload, to: url)
          reply(id, url.path)
        } else {
          reply(id)
        }
      case "importExcel":
        if let url = panel(
          "Choose a Heidy Bakery Excel export", types: [UTType(filenameExtension: "xlsx")!])
        {
          reply(id, try readWorkbook(url))
        } else {
          reply(id)
        }
      case "backup":
        if let url = panel(
          "Save a full bakery backup", save: true, name: "Heidy Bakery \(Self.today()).heidybackup")
        {
          try jsonData(store.backup()).write(to: url, options: .atomic)
          reply(id, url.path)
        } else {
          reply(id)
        }
      case "readBackup":
        if let url = panel("Choose a full bakery backup") {
          let backup = try Store.checkBackup(Data(contentsOf: url, options: .mappedIfSafe))
          pendingRestore = backup
          reply(id, backup["state"]!)
        } else {
          reply(id)
        }
      case "restoreBackup":
        guard let b = pendingRestore else { throw failure("Select a backup first.") }
        let restored = try store.restore(b)
        pendingRestore = nil
        reply(id, restored)
      case "showDataFolder":
        NSWorkspace.shared.open(store.root)
        reply(id, true)
      default: throw failure("Unknown app action.")
      }
    } catch { reply(id, error: error.localizedDescription) }
  }
  static func safeName(_ name: String) -> Bool {
    !name.isEmpty && name == URL(fileURLWithPath: name).lastPathComponent && !name.contains("..")
      && !name.contains("/") && !name.contains("\\")
  }
  static func today() -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Date())
  }
  static func cgImage(_ data: Data, maxPixels: Int = 2400) throws -> CGImage {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil),
      let image = CGImageSourceCreateThumbnailAtIndex(
        source, 0,
        [
          kCGImageSourceCreateThumbnailFromImageAlways: true,
          kCGImageSourceCreateThumbnailWithTransform: true,
          kCGImageSourceThumbnailMaxPixelSize: maxPixels,
        ] as CFDictionary)
    else { throw failure("Could not read this image.") }
    return image
  }
  static func preview(_ data: Data, ext: String) throws -> Data {
    let bitmap: NSBitmapImageRep
    if ext.lowercased() == "pdf" {
      guard let pdf = PDFDocument(data: data), let page = pdf.page(at: 0),
        let tiff = page.thumbnail(of: NSSize(width: 1200, height: 1600), for: .mediaBox)
          .tiffRepresentation, let image = NSBitmapImageRep(data: tiff)
      else { throw failure("Could not read PDF.") }
      bitmap = image
    } else {
      bitmap = NSBitmapImageRep(cgImage: try cgImage(data, maxPixels: 1600))
    }
    guard let png = bitmap.representation(using: .png, properties: [:]) else {
      throw failure("Could not preview receipt.")
    }
    return png
  }
  static func receipt(_ url: URL, root: URL, bytes: Data? = nil) throws -> [String: Any] {
    let data = try bytes ?? Data(contentsOf: url)
    guard !data.isEmpty, data.count <= 40_000_000 else {
      throw failure("Use a nonempty receipt no larger than 40 MB.")
    }
    let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    let ext = url.pathExtension.lowercased()
    guard ReceiptScanner.extensions.contains(ext) else { throw failure("Use a photo or PDF.") }
    var texts: [String] = []
    var pageCount = 1
    var ocrErrors: [String] = []
    func recognize(_ image: CGImage) -> String {
      do {
        let req = VNRecognizeTextRequest()
        req.recognitionLevel = .accurate
        req.usesLanguageCorrection = true
        try VNImageRequestHandler(cgImage: image).perform([req])
        return (req.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(
          separator: "\n")
      } catch {
        ocrErrors.append(error.localizedDescription)
        return ""
      }
    }
    if ext == "pdf" {
      guard let doc = PDFDocument(data: data), !doc.isLocked, doc.pageCount > 0 else {
        throw failure("Unreadable or locked PDF.")
      }
      pageCount = doc.pageCount
      for n in 0..<min(pageCount, 10) {
        guard let page = doc.page(at: n) else { continue }
        if let text = page.string, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
          texts.append(text)
        } else {
          let im = page.thumbnail(of: NSSize(width: 1800, height: 2400), for: .mediaBox)
          if let cg = im.cgImage(forProposedRect: nil, context: nil, hints: nil) {
            texts.append(recognize(cg))
          }
        }
      }
    } else {
      texts.append(recognize(try cgImage(data)))
    }
    let filename = hash + "." + ext
    let target = root.appendingPathComponent("Receipts/" + filename)
    if fm.fileExists(atPath: target.path) {
      guard try Data(contentsOf: target) == data else {
        throw failure("The saved original receipt has conflicting contents.")
      }
    } else {
      try data.write(to: target, options: .atomic)
    }
    return [
      "id": hash, "file": filename, "originalName": url.lastPathComponent, "supplier": "",
      "date": "", "status": "Needs review", "text": texts.joined(separator: "\n\n"),
      "pages": pageCount, "ocrLimited": pageCount > 10,
      "ocrError": ocrErrors.joined(separator: "; "), "lines": [[String: Any]](),
      "importedAt": ISO8601DateFormatter().string(from: Date()),
    ]
  }

}

if CommandLine.arguments.contains("--export-fixture"), CommandLine.arguments.count == 4 {
  do {
    let p =
      try jsonObject(Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[2])))
      as! [String: Any]
    try writeWorkbook(p, to: URL(fileURLWithPath: CommandLine.arguments[3]))
    print("Workbook written")
    exit(0)
  } catch {
    fputs(error.localizedDescription + "\n", stderr)
    exit(1)
  }
} else if CommandLine.arguments.contains("--read-fixture"), CommandLine.arguments.count == 3 {
  do {
    let p = try readWorkbook(URL(fileURLWithPath: CommandLine.arguments[2]))
    print(String(decoding: try jsonData(p), as: UTF8.self))
    exit(0)
  } catch {
    fputs(error.localizedDescription + "\n", stderr)
    exit(1)
  }
} else if CommandLine.arguments.contains("--receipt-fixture"), CommandLine.arguments.count == 3 {
  do {
    guard ProcessInfo.processInfo.environment["HEIDY_DATA_DIR"] != nil else {
      throw failure("Receipt fixtures require an isolated HEIDY_DATA_DIR.")
    }
    let store = try Store()
    let receipt = try AppDelegate.receipt(
      URL(fileURLWithPath: CommandLine.arguments[2]), root: store.root)
    print(String(decoding: try jsonData(receipt), as: UTF8.self))
    exit(0)
  } catch {
    fputs(error.localizedDescription + "\n", stderr)
    exit(1)
  }
} else if CommandLine.arguments.contains("--inbox-test"), CommandLine.arguments.count == 3 {
  do {
    guard ProcessInfo.processInfo.environment["HEIDY_DATA_DIR"] != nil else { throw failure("Inbox tests require isolated data.") }
    let store = try Store(), scanner = ReceiptScanner(), folder = URL(fileURLWithPath: CommandLine.arguments[2])
    let urls = try fm.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
    let first = scanner.collect(urls, root: store.root, known: [], automatic: true)
    guard (first["records"] as? [[String: Any]])?.isEmpty == true, (first["pending"] as? Int ?? 0) >= 2 else { throw failure("First poll did not wait for stable files.") }
    let second = scanner.collect(urls, root: store.root, known: [], automatic: true)
    guard let records = second["records"] as? [[String: Any]], records.count == 2, records.allSatisfy({ !(($0["text"] as? String ?? "").isEmpty) }), (second["errors"] as? [String])?.count == 2 else { throw failure("Stable images/PDFs, OCR, or bad-file isolation failed: \(second)") }
    var state = emptyState(); state["receipts"] = records; try store.save(state); _ = try store.undo()
    let auto = scanner.collect(urls, root: store.root, known: [], ignored: try store.seenReceiptIDs(), automatic: true)
    guard (auto["records"] as? [[String: Any]])?.isEmpty == true else { throw failure("Automatic pickup reversed undo.") }
    let manual = scanner.collect(urls, root: store.root, known: [], ignored: try store.seenReceiptIDs(), automatic: false)
    guard (manual["records"] as? [[String: Any]])?.count == 2 else { throw failure("Manual re-add after undo failed.") }
    let duplicates = scanner.collect(urls, root: store.root, known: Set(records.compactMap { $0["id"] as? String }), automatic: false)
    guard (duplicates["records"] as? [[String: Any]])?.isEmpty == true else { throw failure("Duplicate file imported again.") }
    print("Native inbox passed: stability wait, image OCR, PDF text, zero/invalid/oversize isolation, duplicate detection, automatic undo suppression and manual re-add."); exit(0)
  } catch { fputs(error.localizedDescription + "\n", stderr); exit(1) }
} else if CommandLine.arguments.contains("--self-test") {
  do {
    guard ProcessInfo.processInfo.environment["HEIDY_DATA_DIR"] != nil else {
      throw failure("Self-tests require an isolated HEIDY_DATA_DIR.")
    }
    let store = try Store()
    let state = emptyState()
    var next = state
    next["marker"] = "first change"
    try store.save(next)
    guard (try store.undo() as! [String: Any])["marker"] == nil else {
      throw failure("First-save undo failed")
    }
    try store.save(next)
    let count = try store.query("SELECT COUNT(*) FROM history")
    try store.save(next)
    guard try store.query("SELECT COUNT(*) FROM history") == count else {
      throw failure("No-op save consumed undo")
    }
    for n in 1...35 {
      next["marker"] = n
      try store.save(next)
    }
    guard try store.query("SELECT COUNT(*) FROM history") == "30" else {
      throw failure("Undo limit failed")
    }
    let old = try store.undo() as! [String: Any]
    guard old["marker"] as? Int == 34 else { throw failure("Undo failed") }
    let base = store.root
    let path = base.appendingPathComponent("test.xlsx")
    try writeWorkbook(
      [
        "sheets": [
          ["name": "Ingredients", "rows": [["ID", "Name"], ["one", "Egg & sugar"]]],
          ["name": "Recipes", "rows": [["ID"]]], ["name": "Lines", "rows": [["ID"]]],
          ["name": "Settings", "rows": [["Setting", "Value"], ["laborRate", 24]]],
        ]
      ], to: path)
    let read = try readWorkbook(path)
    guard let rows = read["Ingredients"] as? [[Any]], rows[1][1] as? String == "Egg & sugar" else {
      throw failure("Excel round trip failed")
    }
    let receiptData = Data("test original receipt".utf8)
    try receiptData.write(to: base.appendingPathComponent("Receipts/test.txt"))
    var withReceipt = state
    withReceipt["receipts"] = [
      [
        "id": "test", "file": "test.txt", "originalName": "test.txt", "supplier": "", "date": "",
        "text": "", "status": "Needs review", "lines": [[String: Any]](),
        "importedAt": "2026-01-01T00:00:00Z",
      ]
    ]
    try store.save(withReceipt)
    let backup = try store.backup()
    try store.save(state)
    // Exercise restoration to a missing destination, not just a file already on disk.
    try fm.removeItem(at: base.appendingPathComponent("Receipts/test.txt"))
    _ = try store.restore(backup)
    let checked = try store.state() as! [String: Any]
    guard (checked["receipts"] as? [[String: Any]])?.count == 1 else {
      throw failure("Backup restore failed")
    }
    guard try Data(contentsOf: base.appendingPathComponent("Receipts/test.txt")) == receiptData
    else { throw failure("Original receipt changed") }
    let snapshot = try jsonData(store.state())
    var badState = state
    badState["receipts"] = [["id": "broken"]]
    do {
      try store.save(badState)
      throw failure("Invalid state accepted")
    } catch { if error.localizedDescription == "Invalid state accepted" { throw error } }
    var malformed = backup
    malformed["state"] = badState
    do {
      _ = try store.restore(malformed)
      throw failure("Invalid backup accepted")
    } catch { if error.localizedDescription == "Invalid backup accepted" { throw error } }
    var conflicts = backup
    conflicts["files"] = [
      "new.txt": receiptData.base64EncodedString(),
      "test.txt": Data("conflict".utf8).base64EncodedString(),
    ]
    do {
      _ = try store.restore(conflicts)
      throw failure("Conflicting backup accepted")
    } catch { if error.localizedDescription == "Conflicting backup accepted" { throw error } }
    guard try jsonData(store.state()) == snapshot,
      !fm.fileExists(atPath: base.appendingPathComponent("Receipts/new.txt").path)
    else { throw failure("Rejected restore changed files or state") }
    guard try store.seenReceiptIDs().contains("test") else {
      throw failure("Inbox undo suppression failed")
    }
    guard AppDelegate.safeName("receipt.png"), !AppDelegate.safeName("../receipt.png") else {
      throw failure("Receipt path checks failed")
    }
    print(
      "Native checks passed: initial/no-op/30-entry undo, SQLite rollback, shared data validation, Excel round trip, receipt backup/restore, conflict preflight, and inbox undo suppression."
    )
    exit(0)
  } catch {
    fputs(error.localizedDescription + "\n", stderr)
    exit(1)
  }

} else {
  let app = NSApplication.shared
  let delegate = AppDelegate()
  app.delegate = delegate
  app.setActivationPolicy(.regular)
  app.run()
}
