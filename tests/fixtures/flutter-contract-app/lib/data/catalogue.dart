import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;

/// A book in the library's catalogue. Titles stay in the book's own language.
class Book {
  const Book({
    required this.id,
    required this.title,
    required this.author,
    required this.year,
    required this.shelfMark,
    required this.summary,
    required this.copies,
    required this.onShelf,
  });

  factory Book.fromJson(Map<String, dynamic> json) => Book(
    id: json['id'] as String,
    title: json['title'] as String,
    author: json['author'] as String,
    year: json['year'] as int,
    shelfMark: json['shelfMark'] as String,
    summary: json['summary'] as String,
    copies: json['copies'] as int,
    onShelf: json['onShelf'] as int,
  );

  final String id;
  final String title;
  final String author;
  final int year;
  final String shelfMark;
  final String summary;

  /// How many copies the library owns, and how many are on the shelf now.
  final int copies;
  final int onShelf;
}

/// Where a loan stands, as the library's system works it out.
enum LoanStatus { onLoan, dueSoon, overdue }

/// A book a member has borrowed.
class Loan {
  const Loan({
    required this.id,
    required this.book,
    required this.dueOn,
    required this.status,
    required this.renewalsLeft,
  });

  factory Loan.fromJson(Map<String, dynamic> json) => Loan(
    id: json['id'] as String,
    book: Book.fromJson(json['book'] as Map<String, dynamic>),
    dueOn: DateTime.parse(json['dueOn'] as String),
    status: switch (json['status']) {
      'due-soon' => LoanStatus.dueSoon,
      'overdue' => LoanStatus.overdue,
      _ => LoanStatus.onLoan,
    },
    renewalsLeft: json['renewalsLeft'] as int,
  );

  final String id;
  final Book book;
  final DateTime dueOn;
  final LoanStatus status;
  final int renewalsLeft;
}

class CatalogueException implements Exception {
  const CatalogueException(this.statusCode);
  final int statusCode;

  @override
  String toString() => 'CatalogueException($statusCode)';
}

/// The library's catalogue service.
class CatalogueClient {
  CatalogueClient(this._http);

  final http.Client _http;
  static final _base = Uri.parse('https://api.maktaba.example/');

  Future<List<Book>> books() async {
    final list = await _getList('books');
    return [for (final item in list) Book.fromJson(item)];
  }

  Future<List<Loan>> loans() async {
    final list = await _getList('loans');
    return [for (final item in list) Loan.fromJson(item)];
  }

  Future<void> signIn({required String card, required String pin}) async {
    final response = await _http.post(
      _base.resolve('session'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'card': card, 'pin': pin}),
    );
    if (response.statusCode != 200) {
      throw CatalogueException(response.statusCode);
    }
  }

  Future<void> renew(String loanId) async {
    final response = await _http.post(_base.resolve('loans/$loanId/renew'));
    if (response.statusCode != 200) {
      throw CatalogueException(response.statusCode);
    }
  }

  Future<List<Map<String, dynamic>>> _getList(String path) async {
    final response = await _http.get(_base.resolve(path));
    if (response.statusCode != 200) {
      throw CatalogueException(response.statusCode);
    }
    final body = jsonDecode(utf8.decode(response.bodyBytes)) as List;
    return body.cast<Map<String, dynamic>>();
  }
}

final catalogueProvider = Provider<CatalogueClient>((ref) {
  final client = http.Client();
  ref.onDispose(client.close);
  return CatalogueClient(client);
});

/// Every book in the catalogue.
final booksProvider = FutureProvider<List<Book>>(
  (ref) => ref.watch(catalogueProvider).books(),
);

/// One book, by its id; null when the catalogue has no such book.
final bookProvider = FutureProvider.family<Book?, String>((ref, id) async {
  final books = await ref.watch(booksProvider.future);
  for (final book in books) {
    if (book.id == id) return book;
  }
  return null;
});

/// The signed-in member's loans.
final loansProvider = FutureProvider<List<Loan>>(
  (ref) => ref.watch(catalogueProvider).loans(),
);
