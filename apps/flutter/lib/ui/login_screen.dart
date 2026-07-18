/// Sign-in screen, shown only when the app runs against the real backend and has no token.
library;

import 'package:flutter/material.dart';

import '../core/core.dart';
import 'theme.dart';
import 'widgets.dart';

class LoginScreen extends StatefulWidget {
  final UiState<void> state;
  final void Function(String email, String password) onSubmit;
  const LoginScreen({required this.state, required this.onSubmit, super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController(text: 'buyer@ticketing.local');
  final _password = TextEditingController(text: 'password123');

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loading = widget.state is UiLoading;
    final error = widget.state;
    return Scaffold(
      appBar: AppBar(title: const Text('Sign in')),
      body: ListView(
        padding: const EdgeInsets.all(Tokens.spaceXl),
        children: [
          const MutedText('Use the seeded demo credentials, or your own.'),
          const SizedBox(height: Tokens.spaceMd),
          TextField(controller: _email, decoration: const InputDecoration(labelText: 'Email')),
          const SizedBox(height: Tokens.spaceMd),
          TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password')),
          const SizedBox(height: Tokens.spaceMd),
          if (error is UiError<void>) ErrorBanner(error.error),
          if (error is UiTimedOut<void>) ErrorBanner(error.error),
          const SizedBox(height: Tokens.spaceMd),
          PrimaryButton(
            loading ? 'Signing in…' : 'Sign in',
            onPressed: loading ? null : () => widget.onSubmit(_email.text.trim(), _password.text),
          ),
        ],
      ),
    );
  }
}
