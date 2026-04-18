package com.vallen.maquininha.ui.nav

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.vallen.maquininha.data.AuthRepository
import com.vallen.maquininha.data.Prefs
import com.vallen.maquininha.ui.auth.LoginScreen
import com.vallen.maquininha.ui.auth.SelectFranqueadoScreen
import com.vallen.maquininha.ui.auth.SelectUnidadeScreen
import com.vallen.maquininha.ui.cart.CartScreen
import com.vallen.maquininha.ui.home.HomeScreen
import com.vallen.maquininha.ui.payment.PaymentScreen
import com.vallen.maquininha.ui.result.ResultScreen
import com.vallen.maquininha.ui.setup.SetupScreen
import kotlinx.coroutines.flow.first

@Composable
fun AppNav() {
    var startDestination by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        startDestination = when {
            !AuthRepository.logado                        -> Routes.LOGIN
            Prefs.franqueadoId.first() == null            -> Routes.SELECT_FRANQUEADO
            Prefs.unidadeId.first() == null               -> Routes.SELECT_UNIDADE
            Prefs.terminalId.first() == null              -> Routes.SETUP
            else                                          -> Routes.HOME
        }
    }

    val start = startDestination
    if (start == null) {
        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
        }
        return
    }

    val nav = rememberNavController()
    NavHost(navController = nav, startDestination = start) {

        composable(Routes.LOGIN) {
            LoginScreen(onLogado = {
                nav.navigate(Routes.SELECT_FRANQUEADO) {
                    popUpTo(Routes.LOGIN) { inclusive = true }
                }
            })
        }

        composable(Routes.SELECT_FRANQUEADO) {
            SelectFranqueadoScreen(onEscolhido = {
                nav.navigate(Routes.SELECT_UNIDADE) {
                    popUpTo(Routes.SELECT_FRANQUEADO) { inclusive = true }
                }
            })
        }

        composable(Routes.SELECT_UNIDADE) {
            SelectUnidadeScreen(onEscolhida = {
                nav.navigate(Routes.SETUP) {
                    popUpTo(Routes.SELECT_UNIDADE) { inclusive = true }
                }
            })
        }

        composable(Routes.SETUP) {
            SetupScreen(onDone = {
                nav.navigate(Routes.HOME) {
                    popUpTo(Routes.SETUP) { inclusive = true }
                }
            })
        }

        composable(Routes.HOME) {
            HomeScreen(onVerCarrinho = { nav.navigate(Routes.CART) })
        }

        composable(Routes.CART) {
            CartScreen(
                onVoltar = { nav.popBackStack() },
                onPagar = { nav.navigate(Routes.PAYMENT) }
            )
        }

        composable(Routes.PAYMENT) {
            PaymentScreen(
                onVoltar = { nav.popBackStack() },
                onFinalizado = { aprovado, valor, nsu ->
                    nav.navigate(Routes.result(aprovado, valor, nsu)) {
                        popUpTo(Routes.HOME)
                    }
                }
            )
        }

        composable(
            Routes.RESULT,
            arguments = listOf(
                navArgument("aprovado") { type = NavType.BoolType },
                navArgument("valor")    { type = NavType.FloatType },
                navArgument("nsu")      { type = NavType.StringType }
            )
        ) { entry ->
            val args = entry.arguments!!
            ResultScreen(
                aprovado = args.getBoolean("aprovado"),
                valor = args.getFloat("valor").toDouble(),
                nsu = args.getString("nsu").orEmpty(),
                onVoltar = {
                    nav.navigate(Routes.HOME) {
                        popUpTo(Routes.HOME) { inclusive = true }
                    }
                }
            )
        }
    }
}
