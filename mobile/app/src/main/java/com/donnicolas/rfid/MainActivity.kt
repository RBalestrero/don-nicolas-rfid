package com.donnicolas.rfid

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import com.donnicolas.rfid.ui.auth.LoginScreen
import com.donnicolas.rfid.ui.auth.LoginViewModel
import com.donnicolas.rfid.ui.home.HomeScreen
import com.donnicolas.rfid.ui.theme.DonNicolasTheme

class MainActivity : ComponentActivity() {
    private val viewModel: LoginViewModel by viewModels {
        val app = application as DonNicolasApp
        LoginViewModel.Factory(app.authRepository)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            DonNicolasTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val state by viewModel.state.collectAsState()
                    val user = state.user
                    if (user == null) {
                        LoginScreen(
                            state = state,
                            onEmailChange = viewModel::onEmailChange,
                            onPasswordChange = viewModel::onPasswordChange,
                            onLogin = viewModel::login,
                        )
                    } else {
                        HomeScreen(
                            user = user,
                            onLogout = viewModel::logout,
                        )
                    }
                }
            }
        }
    }
}
