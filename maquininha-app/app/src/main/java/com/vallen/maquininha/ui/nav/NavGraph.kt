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
import com.vallen.maquininha.ui.settings.SettingsEasterEgg
import com.vallen.maquininha.ui.settings.SettingsScreen
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
import com.vallen.maquininha.data.CartStore
import com.vallen.maquininha.plugpag.PaymentKind
import com.vallen.maquininha.ui.cart.CartScreen
import com.vallen.maquininha.ui.cart.EmptyCartScreen
import com.vallen.maquininha.ui.home.HomeScreen
import com.vallen.maquininha.ui.payment.MetodoPagamento
import com.vallen.maquininha.ui.payment.PaymentMethodScreen
import com.vallen.maquininha.ui.payment.PaymentScreen
import com.vallen.maquininha.ui.pendencias.PendenciasScreen
import com.vallen.maquininha.ui.result.ResultScreen
import com.vallen.maquininha.ui.setup.SetupScreen
import com.vallen.maquininha.ui.welcome.WelcomeScreen
import kotlinx.coroutines.flow.first

private fun MetodoPagamento.toPaymentKind(): PaymentKind = when (this) {
    MetodoPagamento.CREDITO -> PaymentKind.CREDIT
    MetodoPagamento.DEBITO  -> PaymentKind.DEBIT
    MetodoPagamento.PIX     -> PaymentKind.PIX
}

@Composable
fun AppNav() {
    var startDestination by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        startDestination = when {
            !AuthRepository.logado                        -> Routes.LOGIN
            Prefs.franqueadoId.first() == null            -> Routes.SELECT_FRANQUEADO
            Prefs.unidadeId.first() == null               -> Routes.SELECT_UNIDADE
            Prefs.terminalId.first() == null              -> Routes.SETUP
            else                                          -> Routes.WELCOME
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

    val cancelarCompra: () -> Unit = {
        CartStore.clear()
        nav.navigate(Routes.WELCOME) {
            popUpTo(Routes.WELCOME) { inclusive = true }
        }
    }

    val onLogoTap: () -> Unit = { SettingsEasterEgg.tap() }

    Box(Modifier.fillMaxSize()) {
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
                nav.navigate(Routes.WELCOME) {
                    popUpTo(Routes.SETUP) { inclusive = true }
                }
            })
        }

        composable(Routes.WELCOME) {
            WelcomeScreen(
                onStart = {
                    nav.navigate(Routes.EMPTY_CART) {
                        popUpTo(Routes.WELCOME) { inclusive = true }
                    }
                },
                onLogoClick = onLogoTap
            )
        }

        composable(Routes.EMPTY_CART) {
            EmptyCartScreen(
                onEscolherLista = { nav.navigate(Routes.HOME) },
                onCancel = cancelarCompra,
                onLogoClick = onLogoTap
            )
        }

        composable(Routes.HOME) {
            HomeScreen(
                onVerCarrinho = { nav.navigate(Routes.CART) },
                onVoltar = { nav.popBackStack() }
            )
        }

        composable(Routes.CART) {
            CartScreen(
                onVoltar = { nav.popBackStack() },
                onPagar = { nav.navigate(Routes.METHOD) },
                onCancelar = cancelarCompra,
                onLogoClick = onLogoTap
            )
        }

        composable(Routes.METHOD) {
            PaymentMethodScreen(
                onVoltar = { nav.popBackStack() },
                onCancelar = cancelarCompra,
                onSelecionar = { metodo ->
                    nav.navigate(Routes.payment(metodo.name))
                }
            )
        }

        composable(
            Routes.PAYMENT,
            arguments = listOf(navArgument("metodo") { type = NavType.StringType })
        ) { entry ->
            val metodoName = entry.arguments?.getString("metodo")
            val metodo = metodoName?.let { runCatching { MetodoPagamento.valueOf(it) }.getOrNull() }
            PaymentScreen(
                metodoInicial = metodo?.toPaymentKind(),
                onVoltar = { nav.popBackStack() },
                onCancelar = cancelarCompra,
                onFinalizado = { aprovado, valor, nsu ->
                    nav.navigate(Routes.result(aprovado, valor, nsu)) {
                        popUpTo(Routes.WELCOME)
                    }
                }
            )
        }

        composable(Routes.PENDENCIAS) {
            PendenciasScreen(onVoltar = { nav.popBackStack() })
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
                    nav.navigate(Routes.WELCOME) {
                        popUpTo(Routes.WELCOME) { inclusive = true }
                    }
                }
            )
        }
    }

        if (SettingsEasterEgg.visivel) {
            SettingsScreen(
                onClose = { SettingsEasterEgg.fechar() },
                onLogout = {
                    SettingsEasterEgg.fechar()
                    nav.navigate(Routes.LOGIN) {
                        popUpTo(nav.graph.id) { inclusive = true }
                    }
                },
                onTrocarUnidade = {
                    SettingsEasterEgg.fechar()
                    nav.navigate(Routes.SELECT_UNIDADE) {
                        popUpTo(nav.graph.id) { inclusive = true }
                    }
                },
                onReconfigurarTerminal = {
                    SettingsEasterEgg.fechar()
                    nav.navigate(Routes.SETUP) {
                        popUpTo(nav.graph.id) { inclusive = true }
                    }
                },
                onPendencias = {
                    SettingsEasterEgg.fechar()
                    nav.navigate(Routes.PENDENCIAS)
                }
            )
        }
    }
}
