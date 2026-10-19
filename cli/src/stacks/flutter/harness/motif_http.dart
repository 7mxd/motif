// Part of Motif's screenshot harness for Flutter apps (decision 0007), written next to motif_shot_test.dart for one
// run and deleted after it: the app's HTTP requests, answered from design/states/http.json in memory, so nothing
// reaches the network and every answer arrives within the test's fake time.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

/// The app's HTTP requests, answered from design/states/http.json; nothing reaches the network.
class MotifHttp {
  MotifHttp(this.routes);
  final List<Map<String, dynamic>> routes;

  /// Told of each request nothing answered: an image (drawn blank) or anything else (a 404).
  void Function(String request, {required bool image})? unanswered;

  static final Uint8List _blank = base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  );

  ({int status, List<int> body, String type}) answer(String method, Uri url, HttpHeaders headers) {
    for (final r in routes) {
      if (r['method'] != method) continue;
      final want = (r['url'] ?? r['path']) as String;
      final query = want.contains('?');
      final got = r['url'] != null
          ? (query ? url.toString() : url.replace(query: '').toString().replaceAll(RegExp(r'\?$'), ''))
          : (query ? '${url.path}?${url.query}' : url.path);
      if (_trim(got) != _trim(want)) continue;
      final file = r['file'] as String?;
      return (
        status: (r['status'] as num? ?? 200).toInt(),
        body: file == null ? const [] : File(file).readAsBytesSync(),
        type: file != null && file.endsWith('.json') ? 'application/json' : 'application/octet-stream',
      );
    }
    final what = '$method ${url.removeFragment()}';
    final image = RegExp(r'\.(png|jpe?g|gif|webp|bmp)$', caseSensitive: false).hasMatch(url.path) ||
        (headers.value(HttpHeaders.acceptHeader) ?? '').startsWith('image/');
    if (image && method == 'GET') {
      unanswered?.call(what, image: true);
      return (status: 200, body: _blank, type: 'image/png');
    }
    unanswered?.call(what, image: false);
    return (status: 404, body: utf8.encode('{}'), type: 'application/json');
  }

  static String _trim(String s) => s.length > 1 && s.endsWith('/') ? s.substring(0, s.length - 1) : s;
}

class MotifHttpOverrides extends HttpOverrides {
  MotifHttpOverrides(this.http);
  final MotifHttp http;

  @override
  HttpClient createHttpClient(SecurityContext? context) => _Client(http);
}

class _Client implements HttpClient {
  _Client(this.http);
  final MotifHttp http;

  @override
  bool autoUncompress = true;
  @override
  Duration? connectionTimeout;
  @override
  Duration idleTimeout = const Duration(seconds: 15);
  @override
  int? maxConnectionsPerHost;
  @override
  String? userAgent;

  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) async => _Request(http, method.toUpperCase(), url);
  @override
  Future<HttpClientRequest> open(String method, String host, int port, String path) =>
      openUrl(method, Uri(scheme: 'http', host: host, port: port, path: path));
  @override
  Future<HttpClientRequest> getUrl(Uri url) => openUrl('GET', url);
  @override
  Future<HttpClientRequest> postUrl(Uri url) => openUrl('POST', url);
  @override
  Future<HttpClientRequest> putUrl(Uri url) => openUrl('PUT', url);
  @override
  Future<HttpClientRequest> patchUrl(Uri url) => openUrl('PATCH', url);
  @override
  Future<HttpClientRequest> deleteUrl(Uri url) => openUrl('DELETE', url);
  @override
  Future<HttpClientRequest> headUrl(Uri url) => openUrl('HEAD', url);
  @override
  void close({bool force = false}) {}
  // Proxies, certificates and credentials don't matter to answers that never leave the test.
  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _Request implements HttpClientRequest {
  _Request(this.http, this.method, this.uri);
  final MotifHttp http;
  @override
  final String method;
  @override
  final Uri uri;
  @override
  final HttpHeaders headers = _Headers();
  @override
  bool followRedirects = true;
  @override
  int maxRedirects = 5;
  @override
  bool persistentConnection = true;
  @override
  int contentLength = -1;
  @override
  bool bufferOutput = true;
  @override
  Encoding encoding = utf8;
  @override
  final List<Cookie> cookies = [];
  final Completer<HttpClientResponse> _done = Completer();

  @override
  void add(List<int> data) {}
  @override
  void write(Object? object) {}
  @override
  void writeAll(Iterable<Object?> objects, [String separator = '']) {}
  @override
  void writeln([Object? object = '']) {}
  @override
  void writeCharCode(int charCode) {}
  @override
  void addError(Object error, [StackTrace? stackTrace]) {}
  @override
  Future<void> addStream(Stream<List<int>> stream) => stream.drain<void>();
  @override
  Future<void> flush() async {}
  @override
  void abort([Object? exception, StackTrace? stackTrace]) {}
  @override
  HttpConnectionInfo? get connectionInfo => null;
  @override
  Future<HttpClientResponse> get done => _done.future;
  @override
  Future<HttpClientResponse> close() async {
    final a = http.answer(method, uri, headers);
    final response = _Response(a.status, a.body, a.type);
    if (!_done.isCompleted) _done.complete(response);
    return response;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _Response extends Stream<List<int>> implements HttpClientResponse {
  _Response(this.statusCode, this.body, String type) {
    headers.set(HttpHeaders.contentTypeHeader, type);
    headers.set(HttpHeaders.contentLengthHeader, '${body.length}');
  }
  final List<int> body;
  @override
  final int statusCode;
  @override
  final HttpHeaders headers = _Headers();

  @override
  String get reasonPhrase => statusCode < 400 ? 'OK' : 'Not Found';
  @override
  int get contentLength => body.length;
  @override
  bool get isRedirect => false;
  @override
  List<RedirectInfo> get redirects => const [];
  @override
  bool get persistentConnection => false;
  @override
  HttpClientResponseCompressionState get compressionState => HttpClientResponseCompressionState.notCompressed;
  @override
  List<Cookie> get cookies => const [];
  @override
  X509Certificate? get certificate => null;
  @override
  HttpConnectionInfo? get connectionInfo => null;

  @override
  StreamSubscription<List<int>> listen(
    void Function(List<int> event)? onData, {
    Function? onError,
    void Function()? onDone,
    bool? cancelOnError,
  }) => Stream<List<int>>.fromIterable([body]).listen(onData, onError: onError, onDone: onDone, cancelOnError: cancelOnError);

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}

class _Headers implements HttpHeaders {
  final Map<String, List<String>> _values = {};

  @override
  List<String>? operator [](String name) => _values[name.toLowerCase()];
  @override
  String? value(String name) => _values[name.toLowerCase()]?.join(',');
  @override
  void add(String name, Object value, {bool preserveHeaderCase = false}) =>
      (_values[name.toLowerCase()] ??= []).add('$value');
  @override
  void set(String name, Object value, {bool preserveHeaderCase = false}) => _values[name.toLowerCase()] = ['$value'];
  @override
  void remove(String name, Object value) => _values[name.toLowerCase()]?.remove('$value');
  @override
  void removeAll(String name) => _values.remove(name.toLowerCase());
  @override
  void forEach(void Function(String name, List<String> values) action) => _values.forEach(action);
  @override
  void noFolding(String name) {}
  @override
  void clear() => _values.clear();
  @override
  ContentType? get contentType {
    final v = value(HttpHeaders.contentTypeHeader);
    return v == null ? null : ContentType.parse(v);
  }

  @override
  set contentType(ContentType? type) =>
      type == null ? removeAll(HttpHeaders.contentTypeHeader) : set(HttpHeaders.contentTypeHeader, type.toString());
  @override
  int get contentLength => int.tryParse(value(HttpHeaders.contentLengthHeader) ?? '') ?? -1;
  @override
  set contentLength(int length) => set(HttpHeaders.contentLengthHeader, '$length');
  @override
  bool chunkedTransferEncoding = false;
  @override
  bool persistentConnection = true;
  @override
  String? host;
  @override
  int? port;
  @override
  DateTime? date;
  @override
  DateTime? expires;
  @override
  DateTime? ifModifiedSince;

  @override
  dynamic noSuchMethod(Invocation invocation) => null;
}
